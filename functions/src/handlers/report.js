'use strict';

/**
 * functions/src/handlers/report.js
 *
 * Abuse reporting.  Writes to the server-only `reports` collection.
 * Rate limited and deduplicated per (messageId, uid).  Contains the
 * reported message only — never the whole chat — unless the user opts to
 * include context.
 */
const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const { log }   = require('../utils/adminLogger');

const db = () => admin.firestore();

const CATEGORIES = ['inaccurate', 'harmful', 'offensive_or_culturally_disrespectful', 'privacy', 'other'];

exports.reportFunctions = functions
  .runWith({ timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Not signed in');
    const uid = context.auth.uid;
    const { messageId, sessionId, category, note, includeContext = false, message } = data || {};

    if (!messageId || !sessionId) throw new functions.https.HttpsError('invalid-argument', 'messageId and sessionId required');
    if (!CATEGORIES.includes(category)) throw new functions.https.HttpsError('invalid-argument', 'Unknown category');

    // Deduplicate per (uid, messageId) inside a transaction.
    const dedupeKey = `${uid}_${messageId}`;
    const ref = db().collection('reports').doc(dedupeKey);
    await db().runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) return;
      tx.set(ref, {
        reporterUid: uid,
        messageId,
        sessionId,
        category,
        note: typeof note === 'string' ? note.slice(0, 500) : '',
        includeContext: Boolean(includeContext),
        // Reported message only — never the whole chat unless opted in.
        reportedMessage: typeof message === 'string' ? message.slice(0, 8000) : '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    log.info('Report submitted', { category, uid });
    return { ok: true };
  });

module.exports = { CATEGORIES };