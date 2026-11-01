'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { corsMiddleware } = require('../utils/cors');

const POLICY_VERSION = process.env.POLICY_VERSION || 'VERIFY';

exports.consentFunctions = functions
  .region('us-central1')
  .https.onRequest((req, res) => {
    corsMiddleware(req, res, async () => {
      try {
        if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' });
        const token = await admin.auth().verifyIdToken(authHeader.slice(7));
        const uid = token.uid;
        const { action, type, granted, locale } = req.body || {};
        const db = admin.firestore();

        if (action === 'verify') {
          const types = ['terms_privacy', 'age_18'];
          const snaps = await Promise.all(types.map(t => db.doc(users//consents/).get()));
          const ok = snaps.every(s => {
            if (!s.exists) return false;
            const d = s.data();
            return d.granted === true && d.withdrawnAt == null && (d.policyVersion === POLICY_VERSION || POLICY_VERSION === 'VERIFY');
          });
          return res.json({ ok });
        }

        if (action === 'record') {
          const allowed = ['terms_privacy', 'age_18', 'training', 'analytics'];
          if (!allowed.includes(type)) return res.status(400).json({ error: 'invalid_type' });
          const ref = db.doc(users//consents/);
          await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (snap.exists && snap.data().granted === granted) return;
            tx.set(ref, {
              type,
              granted: !!granted,
              policyVersion: POLICY_VERSION,
              locale: locale || 'en',
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              withdrawnAt: granted ? null : admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
          });
          return res.json({ ok: true });
        }

        if (action === 'list') {
          const snap = await db.collection(users//consents).get();
          const consents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          return res.json({ consents });
        }

        if (action === 'withdraw') {
          const allowed = ['terms_privacy', 'age_18', 'training', 'analytics'];
          if (!allowed.includes(type)) return res.status(400).json({ error: 'invalid_type' });
          const ref = db.doc(users//consents/);
          await ref.set({ withdrawnAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          return res.json({ ok: true });
        }

        return res.status(400).json({ error: 'invalid_action' });
      } catch (e) {
        return res.status(500).json({ error: 'internal' });
      }
    });
  });
