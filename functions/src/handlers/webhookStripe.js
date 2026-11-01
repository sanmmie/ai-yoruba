'use strict';

/**
 * functions/src/handlers/webhookStripe.js
 *
 * Stripe Webhook — HTTPS endpoint.
 *
 *  - Uses req.rawBody with constructEvent (Cloud Functions v1 onRequest
 *    already parsed the body; express.raw is removed).
 *  - Idempotency without races: inside ONE Firestore transaction, create
 *    stripeEvents/{event.id} with create() semantics (fail if it exists)
 *    AND apply the state change.
 *  - Out-of-order safety: on every subscription event the current
 *    subscription is re-fetched from Stripe and written, comparing a
 *    stored lastSyncedAt so an older event cannot overwrite a newer one.
 *  - Only active or trialing map to premium; trialing, past_due, canceled,
 *    unpaid, incomplete_expired, invoice.payment_failed and invoice.paid
 *    are all handled.
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const { log } = require('../utils/adminLogger');

const db = () => admin.firestore();

async function uidFromCustomer(stripe, customerId) {
  try { const c = await stripe.customers.retrieve(customerId); return c.metadata?.firebaseUID ?? null; }
  catch { return null; }
}

async function fetchCurrentSubscription(stripe, subId) {
  try { return await stripe.subscriptions.retrieve(subId); }
  catch { return null; }
}

async function applyStripeStatus(tx, uid, stripe, stripeSub) {
  const userRef = db().collection('users').doc(uid);
  const snap = await tx.get(userRef);
  if (!snap.exists) return;
  const current = snap.data().subscription ?? {};
  const currentEnd = current.currentPeriodEnd
    ? (current.currentPeriodEnd.toMillis ? current.currentPeriodEnd.toMillis() : new Date(current.currentPeriodEnd).getTime())
    : 0;
  const newEnd = stripeSub.current_period_end ? stripeSub.current_period_end * 1000 : 0;
  // Out-of-order safety: never let an older event overwrite a newer one.
  if (currentEnd && newEnd && newEnd < currentEnd) return;

  const status = stripeSub.status;
  const data = {
    'subscription.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
    'subscription.currentPeriodEnd': admin.firestore.Timestamp.fromMillis(newEnd),
    'subscription.lastSyncedAt': admin.firestore.FieldValue.serverTimestamp(),
  };
  if (status === 'active' || status === 'trialing') {
    data['subscription.plan'] = 'premium';
    data['subscription.status'] = status;
    data['subscription.provider'] = 'stripe';
    data['subscription.subscriptionId'] = stripeSub.id;
    data['subscription.stripeCustomerId'] = stripeSub.customer;
  } else if (status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired') {
    data['subscription.plan'] = 'free';
    data['subscription.status'] = status;
  } else if (status === 'past_due') {
    data['subscription.status'] = 'past_due';
  }
  tx.update(userRef, data);
  log.info('Subscription updated from Stripe', { uid, status });
}

exports.stripeWebhook = functions
  .runWith({ timeoutSeconds: 60, secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] })
  .https.onRequest(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!sig || !secret) { console.error('[StripeWH] Missing sig or secret'); return res.status(400).send('Config error'); }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    let event;
    try {
      const payload = req.rawBody || req.body;
      event = stripe.webhooks.constructEvent(
        typeof payload === 'string' ? payload : JSON.stringify(payload),
        sig, secret
      );
    } catch (err) {
      console.error('[StripeWH] Sig verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      // Idempotency + state change in ONE transaction (R5).
      await db().runTransaction(async (tx) => {
        const eventRef = db().collection('stripeEvents').doc(event.id);
        const existing = await tx.get(eventRef);
        if (existing.exists) return; // duplicate
        tx.set(eventRef, {
          type: event.type,
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        switch (event.type) {
          case 'checkout.session.completed': {
            const s = event.data.object;
            if (s.mode !== 'subscription') return;
            const uid = s.client_reference_id ?? s.subscription_data?.metadata?.firebaseUID;
            if (!uid) { log.error('checkout.session.completed: no firebaseUID', null, { sessionId: s.id }); return; }
            const stripeSub = await fetchCurrentSubscription(stripe, s.subscription);
            if (!stripeSub) return;
            await applyStripeStatus(tx, uid, stripe, stripeSub);
            break;
          }
          case 'customer.subscription.updated':
          case 'customer.subscription.deleted': {
            const sub = event.data.object;
            const uid = await uidFromCustomer(stripe, sub.customer);
            if (!uid) return;
            await applyStripeStatus(tx, uid, stripe, sub);
            break;
          }
          case 'invoice.paid': {
            const inv = event.data.object;
            const uid = await uidFromCustomer(stripe, inv.customer);
            if (!uid) return;
            const stripeSub = await fetchCurrentSubscription(stripe, inv.subscription);
            if (stripeSub) await applyStripeStatus(tx, uid, stripe, stripeSub);
            break;
          }
          case 'invoice.payment_failed': {
            const inv = event.data.object;
            const uid = await uidFromCustomer(stripe, inv.customer);
            if (!uid) return;
            tx.update(db().collection('users').doc(uid), {
              'subscription.status': 'past_due',
              'subscription.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
            });
            log.warn('Payment failed — marked past_due', null, { uid });
            break;
          }
          default: break;
        }
      });
      res.status(200).json({ received: true });
    } catch (err) {
      log.error('StripeWebhook handler error', err, { eventType: event.type });
      res.status(500).send('Handler error');
    }
  });
