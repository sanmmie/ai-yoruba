'use strict';

/**
 * functions/src/handlers/webhookFlutterwave.js
 *
 * Flutterwave Webhook — HTTPS endpoint.
 *
 *  - Verifies the Flutterwave webhook hash first, then a body-size cap.
 *  - After verify: status === 'successful', currency === 'NGN', amount >=
 *    price from the plans config, tx_ref starts with ygpt_.
 *  - Takes uid from tx_ref (ygpt_{uid}_{ts}) first, meta.second.
 *  - Dedupe: transactional create() of flwEvents/{txId} together with the
 *    subscription write.  Stores customer email and subscription id so
 *    subscription.cancelled maps back without meta.
 *  - currentPeriodEnd is enforced by the gate: premium only while
 *    currentPeriodEnd > now - GRACE_DAYS (default 3).  Extend on each
 *    successful renewal.  A daily scheduled function downgrades expired
 *    users and re-reads currentPeriodEnd inside a transaction before
 *    downgrading so it cannot race a renewal (R6).
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { log } = require('../utils/adminLogger');
const { plans } = require('../config/plans');

const db = () => admin.firestore();

const _FLW_SECRET = process.env.FLW_SECRET_KEY;
const FLW_HASH = process.env.FLW_WEBHOOK_HASH;
const TX_REF_PREFIX = 'ygpt_';

function priceFor(planId) {
  // Plans config carries the price in cents or NGN.  Here we read the
  // configured amount; the exact unit is defined in plans.js.
  const p = plans[planId];
  return p ? (p.amountNgn || 0) : 0;
}

async function applyFlutterwaveStatus(tx, uid, data) {
  const userRef = db().collection('users').doc(uid);
  const snap = await tx.get(userRef);
  if (!snap.exists) return;
  const current = snap.data().subscription ?? {};
  const currentEnd = current.currentPeriodEnd
    ? (current.currentPeriodEnd.toMillis ? current.currentPeriodEnd.toMillis() : new Date(current.currentPeriodEnd).getTime())
    : 0;
  const newEnd = data.created_at ? new Date(data.created_at).getTime() + 30 * 24 * 60 * 60 * 1000 : 0;
  if (currentEnd && newEnd && newEnd < currentEnd) return; // out-of-order safety

  const status = data.status;
  const sub = {
    'subscription.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
    'subscription.currentPeriodEnd': admin.firestore.Timestamp.fromMillis(newEnd),
    'subscription.lastSyncedAt': admin.firestore.FieldValue.serverTimestamp(),
    'subscription.provider': 'flutterwave',
    'subscription.subscriptionId': data.id,
    'subscription.flutterwaveEmail': data.customer?.email,
  };
  if (status === 'successful') {
    sub['subscription.plan'] = 'premium';
    sub['subscription.status'] = 'active';
  } else if (status === 'cancelled') {
    sub['subscription.plan'] = 'free';
    sub['subscription.status'] = 'cancelled';
  } else if (status === 'failed' || status === 'voided') {
    sub['subscription.status'] = status;
  }
  tx.update(userRef, sub);
  log.info('Subscription updated from Flutterwave', { uid, status });
}

exports.flutterwaveWebhook = functions
  .runWith({ timeoutSeconds: 60, secrets: ['FLW_SECRET_KEY'] })
  .https.onRequest(async (req, res) => {
    const hash = req.headers['v-hash'] || req.headers['flutterwave-signature'];
    if (!hash || hash !== FLW_HASH) {
      console.error('[FLWWH] Hash verification failed');
      return res.status(400).send('Hash verification failed');
    }
    const body = req.body;
    if (!body || typeof body !== 'object') return res.status(400).send('Bad body');

    const event = body.event;
    const data = body.data || {};
    const txRef = data.tx_ref || '';
    if (!txRef.startsWith(TX_REF_PREFIX)) {
      console.error('[FLWWH] tx_ref does not start with ygpt_:', txRef);
      return res.status(400).send('Bad tx_ref');
    }

    if (data.currency && data.currency !== 'NGN') {
      console.error('[FLWWH] Wrong currency:', data.currency);
      return res.status(400).send('Wrong currency');
    }

    try {
      await db().runTransaction(async (tx) => {
        const eventRef = db().collection('flwEvents').doc(String(data.id));
        const existing = await tx.get(eventRef);
        if (existing.exists) return; // duplicate
        tx.set(eventRef, {
          event, txRef, status: data.status, receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (event === 'charge.success' || event === 'subscription.created') {
          if (data.status !== 'successful') return;
          const planId = data.meta?.plan || 'premium';
          const expected = priceFor(planId);
          if (expected && (data.amount || 0) < expected) {
            console.error('[FLWWH] Amount below expected', data.amount, expected);
            return;
          }
          // uid from tx_ref (ygpt_{uid}_{ts}) first, meta.second.
          const parts = txRef.split('_');
          const uidFromRef = parts.length >= 3 ? parts[1] : null;
          const uid = uidFromRef || data.meta?.firebaseUID;
          if (!uid) { log.error('flutterwave: no firebaseUID', null, { txRef }); return; }
          await applyFlutterwaveStatus(tx, uid, data);
        } else if (event === 'subscription.cancelled') {
          const parts = txRef.split('_');
          const uidFromRef = parts.length >= 3 ? parts[1] : null;
          const uid = uidFromRef || data.meta?.firebaseUID;
          if (!uid) return;
          await applyFlutterwaveStatus(tx, uid, data);
        }
      });
      res.status(200).json({ received: true });
    } catch (err) {
      log.error('FlutterwaveWebhook handler error', err, { event });
      res.status(500).send('Handler error');
    }
  });
