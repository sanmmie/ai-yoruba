'use strict';

/**
 * functions/src/handlers/export.js
 *
 * Data-subject access request (DSAR): "Download my data".
 * Returns a JSON document containing the profile, consents, sessions and
 * messages owned by the caller.  Never includes server-only collections
 * (usage, reservations, rate limits, reports, evidence).
 */
const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const { log }   = require('../utils/adminLogger');

const db = () => admin.firestore();

async function exportUserData(uid) {
  const userRef = db().collection('users').doc(uid);
  const [userSnap, consentsSnap, sessionsSnap] = await Promise.all([
    userRef.get(),
    userRef.collection('consents').get(),
    userRef.collection('sessions').get(),
  ]);

  const sessions = [];
  for (const s of sessionsSnap.docs) {
    const msgSnap = await s.ref.collection('messages').orderBy('seq', 'asc').get();
    sessions.push({
      id: s.id,
      ...s.data(),
      messages: msgSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    });
  }

  return {
    exportedAt: new Date().toISOString(),
    profile: userSnap.exists ? userSnap.data() : null,
    consents: consentsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    sessions,
  };
}

exports.exportFunctions = functions
  .runWith({ timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Not signed in');
    const uid = context.auth.uid;
    const payload = await exportUserData(uid);
    log.info('Data exported', { uid });
    return payload;
  });

module.exports = { exportUserData };