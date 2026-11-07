'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { corsMiddleware } = require('../utils/cors');

exports.deletionFunctions = functions
  .region('us-central1')
  .https.onRequest((req, res) => {
    corsMiddleware(req, res, async () => {
      try {
        if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' });
        const token = await admin.auth().verifyIdToken(authHeader.slice(7));
        const uid = token.uid;
        const { action } = req.body || {};
        const db = admin.firestore();
        if (action === 'deleteAccount') {
          // Tombstone
          await db.collection('deletedUsers').doc(uid).set({ deletedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          // Delete sessions/messages best effort
          const sessions = await db.collection('users').doc(uid).collection('sessions').get();
          for (const s of sessions.docs) {
            const msgs = await db.collection('users').doc(uid).collection('sessions').doc(s.id).collection('messages').get();
            for (const m of msgs.docs) await m.ref.delete();
            await s.ref.delete();
          }
          await db.collection('users').doc(uid).delete().catch(() => {});
          try { await admin.auth().deleteUser(uid); } catch (e) {}
          return res.json({ ok: true });
        }
        return res.status(400).json({ error: 'invalid_action' });
      } catch (e) {
        return res.status(500).json({ error: 'internal' });
      }
    });
  });

async function purgeUser(uid, { hardDeleteAuth = true } = {}) {
  const db = admin.firestore();
  await db.collection('deletedUsers').doc(uid).set({ deletedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  const sessions = await db.collection('users').doc(uid).collection('sessions').get();
  for (const sdoc of sessions.docs) {
    const msgs = await db.collection('users').doc(uid).collection('sessions').doc(sdoc.id).collection('messages').get();
    for (const m of msgs.docs) await m.ref.delete();
    await sdoc.ref.delete();
  }
  await db.collection('users').doc(uid).delete().catch(() => {});
  if (hardDeleteAuth) { try { await admin.auth().deleteUser(uid); } catch (e) {} }
}

exports.purgeUser = purgeUser;
