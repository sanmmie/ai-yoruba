'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { corsMiddleware } = require('../utils/cors');

exports.exportFunctions = functions
  .region('us-central1')
  .https.onRequest((req, res) => {
    corsMiddleware(req, res, async () => {
      try {
        if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' });
        const token = await admin.auth().verifyIdToken(authHeader.slice(7));
        const uid = token.uid;
        const db = admin.firestore();
        const userSnap = await db.collection('users').doc(uid).get();
        const sessions = await db.collection('users').doc(uid).collection('sessions').get();
        const data = {
          profile: userSnap.exists ? userSnap.data() : null,
          sessions: [],
        };
        for (const s of sessions.docs) {
          const msgs = await db.collection('users').doc(uid).collection('sessions').doc(s.id).collection('messages').orderBy('seq','asc').get();
          data.sessions.push({ id: s.id, ...s.data(), messages: msgs.docs.map(m => ({ id: m.id, ...m.data() })) });
        }
        res.setHeader('Content-Disposition', 'attachment; filename="yorubagpt-export.json"');
        res.setHeader('Content-Type', 'application/json');
        return res.json(data);
      } catch (e) {
        return res.status(500).json({ error: 'internal' });
      }
    });
  });
