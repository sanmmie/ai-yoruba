'use strict';
/**
 * functions/src/handlers/webhookFlutterwave.js
 * Flutterwave Webhook — HTTPS endpoint
 */
const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const express   = require('express');
const axios     = require('axios');
const { log }   = require('../utils/adminLogger');

const app = express();
app.use(express.json());

app.post('/', async (req, res) => {
  const received = req.headers['verif-hash'];
  const expected = process.env.FLW_WEBHOOK_HASH;
  if (!received || !expected || received !== expected) {
    console.error('[FLWWH] Hash verification failed');
    return res.status(401).send('Unauthorized');
  }

  const { event: eventType, data } = req.body ?? {};

  try {
    if (eventType === 'charge.completed') {
      if (data?.status !== 'successful') return res.status(200).json({ status: 'ignored' });

      const txId = data.id;
      const eventRef = admin.firestore().collection('flwEvents').doc(String(txId));
      const eventSnap = await eventRef.get();
      if (eventSnap.exists) {
        return res.status(200).json({ status: 'duplicate' });
      }

      const verified = await verifyTx(txId);
      if (!verified || verified.status !== 'successful') {
        log.error('FLW re-verification failed — possible replay attack', null, { txId });
        return res.status(400).send('Verification failed');
      }

      const currency = verified.currency || data.currency;
      const amount = Number(verified.amount || data.amount);
      const configured = Number(process.env.FLW_PRICE_NGN || '5000');
      if (currency !== 'NGN' || amount < configured) {
        log.error('FLW amount/currency check failed', null, { txId, currency, amount });
        return res.status(400).send('Invalid amount');
      }

      const txRef = verified.tx_ref || data.tx_ref || '';
      let uid = null;
      if (txRef && txRef.startsWith('ygpt_')) {
        const parts = txRef.split('_');
        if (parts[1]) uid = parts[1];
      }
      if (!uid) uid = verified.meta?.firebaseUID || data.meta?.firebaseUID || null;
      if (!uid && verified.customer?.email) {
        const users = await admin.firestore().collection('users').where('email', '==', verified.customer.email).limit(1).get();
        if (!users.empty) uid = users.docs[0].id;
      }
      if (!uid) { log.error('FLW: no firebaseUID found', null, { txId }); return res.status(400).send('No user'); }

      await eventRef.set({ txId, uid, receivedAt: admin.firestore.FieldValue.serverTimestamp() });

      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);
      await admin.firestore().collection('users').doc(uid).set({
        subscription: {
          plan:'premium', status:'active', provider:'flutterwave',
          flutterwaveCustomerId: verified.customer?.email || data.customer?.email || '',
          subscriptionId:        String(verified.flw_ref || verified.id || txId),
          currentPeriodEnd:      admin.firestore.Timestamp.fromDate(periodEnd),
          updatedAt:             admin.firestore.FieldValue.serverTimestamp(),
        },
        email: verified.customer?.email || data.customer?.email || undefined,
      }, { merge: true });
      log.info('Premium activated via Flutterwave', { uid, txId });
      return res.status(200).json({ status: 'success' });
    }

    if (eventType === 'subscription.cancelled') {
      const txRef = req.body?.data?.tx_ref || '';
      let uid = req.body?.data?.meta?.firebaseUID || null;
      if (!uid && txRef.startsWith('ygpt_')) {
        const parts = txRef.split('_');
        if (parts[1]) uid = parts[1];
      }
      if (!uid && req.body?.data?.customer?.email) {
        const users = await admin.firestore().collection('users').where('email', '==', req.body.data.customer.email).limit(1).get();
        if (!users.empty) uid = users.docs[0].id;
      }
      if (!uid) return res.status(200).json({ status: 'ignored' });
      await admin.firestore().collection('users').doc(uid).update({
        'subscription.plan':'free', 'subscription.status':'inactive',
        'subscription.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
      });
      log.info('FLW subscription cancelled — downgraded to free', { uid });
      return res.status(200).json({ status: 'success' });
    }

    return res.status(200).json({ status: 'ignored' });
  } catch (err) {
    log.error('FLW webhook handler error', err, { eventType });
    return res.status(500).send('Handler error');
  }
});

async function verifyTx(txId) {
  try {
    const r = await axios.get(`https://api.flutterwave.com/v3/transactions/${txId}/verify`,
      { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } });
    return r.data?.data ?? null;
  } catch (err) { log.error('FLW verify API error', err, { txId }); return null; }
}

exports.flutterwaveWebhook = functions
  .runWith({ timeoutSeconds: 30, secrets: ['FLW_SECRET_KEY','FLW_WEBHOOK_HASH'] })
  .https.onRequest(app);
