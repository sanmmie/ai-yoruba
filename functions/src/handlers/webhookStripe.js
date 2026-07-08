'use strict';
/**
 * functions/src/handlers/webhookStripe.js
 * Stripe Webhook — HTTPS endpoint
 *
 * CRITICAL SECURITY: Signature Verification
 * Every request MUST be verified with stripe.webhooks.constructEvent().
 * Without this, an attacker can POST a fake "checkout.session.completed"
 * and activate premium for free.
 *
 * express.raw() is REQUIRED — the HMAC is computed over the raw byte buffer.
 * Using express.json() silently corrupts the signature check.
 *
 * Events handled:
 *  checkout.session.completed      → activate subscription
 *  customer.subscription.updated   → sync status
 *  customer.subscription.deleted   → downgrade to free
 *  invoice.payment_failed          → mark past_due
 */
const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const express   = require('express');
const Stripe    = require('stripe');
const { log }   = require('../utils/adminLogger');

const router = express.Router();
router.use(express.raw({ type: 'application/json' })); // RAW body required

router.post('/', async (req, res) => {
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) { console.error('[StripeWH] Missing sig or secret'); return res.status(400).send('Config error'); }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, sig, secret); }
  catch (err) { console.error('[StripeWH] Sig verification failed:', err.message); return res.status(400).send(`Webhook Error: ${err.message}`); }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const s = event.data.object;
        if (s.mode !== 'subscription') break;
        const uid = s.client_reference_id ?? s.subscription_data?.metadata?.firebaseUID;
        if (!uid) { log.error('checkout.session.completed: no firebaseUID', null, { sessionId: s.id }); break; }
        const stripeSub = await stripe.subscriptions.retrieve(s.subscription);
        await setSubscription(uid, {
          plan:'premium', status:'active', provider:'stripe',
          stripeCustomerId: s.customer, subscriptionId: s.subscription,
          currentPeriodEnd: admin.firestore.Timestamp.fromMillis(stripeSub.current_period_end * 1000),
        });
        log.info('Premium activated via Stripe', { uid, subId: s.subscription });
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const uid = await uidFromCustomer(stripe, sub.customer);
        if (!uid) break;
        const status = sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : 'inactive';
        await admin.firestore().collection('users').doc(uid).update({
          'subscription.status':           status,
          'subscription.currentPeriodEnd': admin.firestore.Timestamp.fromMillis(sub.current_period_end * 1000),
          'subscription.updatedAt':        admin.firestore.FieldValue.serverTimestamp(),
        });
        log.info('Subscription updated', { uid, status });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const uid = await uidFromCustomer(stripe, sub.customer);
        if (!uid) break;
        await admin.firestore().collection('users').doc(uid).update({
          'subscription.plan':'free', 'subscription.status':'inactive',
          'subscription.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
        });
        log.info('Subscription cancelled — downgraded to free', { uid });
        break;
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object;
        const uid = await uidFromCustomer(stripe, inv.customer);
        if (!uid) break;
        await admin.firestore().collection('users').doc(uid).update({
          'subscription.status':'past_due',
          'subscription.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
        });
        log.warn('Payment failed — marked past_due', null, { uid });
        break;
      }

      default: break;
    }
  } catch (err) {
    log.error('StripeWebhook handler error', err, { eventType: event.type });
    return res.status(500).send('Handler error'); // triggers Stripe retry
  }

  res.status(200).json({ received: true });
});

async function setSubscription(uid, data) {
  await admin.firestore().collection('users').doc(uid).set(
    { subscription: { ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() } },
    { merge: true }
  );
}

async function uidFromCustomer(stripe, customerId) {
  try { const c = await stripe.customers.retrieve(customerId); return c.metadata?.firebaseUID ?? null; }
  catch { return null; }
}

const app = express();
app.use('/', router);

exports.stripeWebhook = functions
  .runWith({ timeoutSeconds: 30, secrets: ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'] })
  .https.onRequest(app);
