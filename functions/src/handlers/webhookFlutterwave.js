'use strict';
/**
 * functions/src/handlers/webhookFlutterwave.js
 * Flutterwave Webhook — HTTPS endpoint
 *
 * CRITICAL SECURITY: Dual Verification
 *  Step 1 — verif-hash header must match FLW_WEBHOOK_HASH (set in dashboard)
 *  Step 2 — Re-verify transaction via GET /v3/transactions/{id}/verify
 *            This defeats replay / payload-mutation attacks where the hash is
 *            valid but the transaction status has been forged.
 *
 * Events handled:
 *  charge.completed (status: successful) → activate premium
 *  subscription.cancelled                → downgrade to free
 */
const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const express   = require('express');
const axios     = require('axios');
const { log }   = require('../utils/adminLogger');

const router = express.Router();
router.use(express.json());

router.post('/', async (req, res) => {
  // Step 1: Hash verification
  const received = req.headers['verif-hash'];
  const expected = process.env.FLW_WEBHOOK_HASH;
  if (!received || !expected || received !== expected) {
    console.error('[FLWWH] Hash verification failed');
    return res.status(401).send('Unauthorized');
  }

  const { event: eventType, data } = req.body ?? {};

  try {
    switch (eventType) {

      case 'charge.completed': {
        if (data?.status !== 'successful') break;

        // Step 2: Re-verify with Flutterwave API
        const verified = await verifyTx(data.id);
        if (!verified || verified.status !== 'successful') {
          log.error('FLW re-verification failed — possible replay attack', null, { txId: data.id });
          break;
        }

        const uid = data.meta?.firebaseUID ?? verified.meta?.firebaseUID;
        if (!uid) { log.error('FLW: no firebaseUID in meta', null, { txId: data.id }); break; }

        const periodEnd = new Date(); periodEnd.setDate(periodEnd.getDate() + 30);
        await admin.firestore().collection('users').doc(uid).set({
          subscription: {
            plan:'premium', status:'active', provider:'flutterwave',
            flutterwaveCustomerId: data.customer?.email ?? '',
            subscriptionId:        String(data.id),
            currentPeriodEnd:      admin.firestore.Timestamp.fromDate(periodEnd),
            updatedAt:             admin.firestore.FieldValue.serverTimestamp(),
          },
        }, { merge: true });
        log.info('Premium activated via Flutterwave', { uid, txId: data.id });
        break;
      }

      case 'subscription.cancelled': {
        const uid = req.body?.data?.meta?.firebaseUID;
        if (!uid) break;
        await admin.firestore().collection('users').doc(uid).update({
          'subscription.plan':'free', 'subscription.status':'inactive',
          'subscription.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
        });
        log.info('FLW subscription cancelled — downgraded to free', { uid });
        break;
      }

      default: break;
    }
  } catch (err) {
    log.error('FLW webhook handler error', err, { eventType });
    return res.status(500).send('Handler error');
  }

  res.status(200).json({ status: 'success' });
});

async function verifyTx(txId) {
  try {
    const r = await axios.get(`https://api.flutterwave.com/v3/transactions/${txId}/verify`,
      { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } });
    return r.data?.data ?? null;
  } catch (err) { log.error('FLW verify API error', err, { txId }); return null; }
}

const app = express();
app.use('/', router);

exports.flutterwaveWebhook = functions
  .runWith({ timeoutSeconds: 30, secrets: ['FLW_SECRET_KEY','FLW_WEBHOOK_HASH'] })
  .https.onRequest(app);
