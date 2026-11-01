'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { corsMiddleware } = require('../utils/cors');

exports.reportFunctions = functions
  .region('us-central1')
  .https.onRequest((req, res) => {
    corsMiddleware(req, res, async () => {
      try {
        if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' });
        const token = await admin.auth().verifyIdToken(authHeader.slice(7));
        const uid = token.uid;
        const { messageId, sessionId, category, reason } = req.body || {};
        const db = admin.firestore();
        const ref = db.collection('reports').doc();
        await ref.set({
          reportId: ref.id,
          uid,
          messageId: messageId || null,
          sessionId: sessionId || null,
          category: category || 'other',
          reason: reason || '',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'open',
        });
        return res.json({ ok: true, reportId: ref.id });
      } catch (e) {
        return res.status(500).json({ error: 'internal' });
      }
    });
  });
