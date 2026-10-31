'use strict';

/**
 * functions/src/handlers/consent.js
 *
 * Server-side consent recording, withdrawal and verification.
 *
 * NDPA compliance: consent is recorded by the server, never by the client.
 * Each record is idempotent keyed by (uid, type) so concurrent requests
 * (R13) cannot create duplicate records or race a withdrawal against a
 * chat reservation.
 *
 * Records live in users/{uid}/consents/{type} and are readable ONLY by the
 * owner (firestore.rules).  A server-only evidence copy may be added later
 * if counsel requires it; that collection is denied to clients.
 */
const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const { log }   = require('../utils/adminLogger');
const { POLICY_VERSION, REQUIRED_CONSENTS, CONSENT_TYPES } = require('../config/policy');

const db = () => admin.firestore();

function consentRef(uid, type) {
  return db().collection('users').doc(uid).collection('consents').doc(type);
}

/**
 * Record a consent.  Idempotent: re-granting an existing consent updates
 * the locale and clears withdrawnAt; withdrawing then re-granting works.
 * The policyVersion stored is always the version at write time, so a later
 * policy bump invalidates the record automatically.
 */
async function recordConsent(uid, { type, granted, locale = 'en' }) {
  if (!CONSENT_TYPES[type]) {
    throw new functions.https.HttpsError('invalid-argument', 'Unknown consent type');
  }
  const now = admin.firestore.FieldValue.serverTimestamp();
  const data = {
    type,
    granted: Boolean(granted),
    policyVersion: POLICY_VERSION,
    locale,
    createdAt: now,
    updatedAt: now,
  };
  if (!granted) {
    data.withdrawnAt = now;
  } else {
    data.withdrawnAt = admin.firestore.FieldValue.delete();
  }
  // Idempotent transaction (R13): concurrent duplicates collapse to one write.
  await db().runTransaction(async (tx) => {
    tx.set(consentRef(uid, type), data, { merge: true });
  });
  log.info('Consent recorded', { type, granted, uid });
  return { ok: true };
}

/**
 * Verify the required consents exist and are current.  Returns
 * { ok, missing: [] } so the chat endpoint can reject with
 * consent_required and the client can show the consent screen.  Called
 * from the chat endpoint at reservation time so a withdrawal racing a chat
 * request is evaluated atomically (R13).
 */
async function verifyRequiredConsents(uid) {
  const snap = await db().collection('users').doc(uid).collection('consents').get();
  const present = {};
  for (const doc of snap.docs) present[doc.id] = doc.data();
  const missing = [];
  for (const type of REQUIRED_CONSENTS) {
    const rec = present[type];
    if (!rec || !rec.granted || rec.withdrawnAt || rec.policyVersion !== POLICY_VERSION) {
      missing.push(type);
    }
  }
  return { ok: missing.length === 0, missing, policyVersion: POLICY_VERSION };
}

/**
 * Read the consents the owner is allowed to see (used by Settings).
 */
async function listConsents(uid) {
  const snap = await db().collection('users').doc(uid).collection('consents').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

exports.consentFunctions = functions
  .runWith({ timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Not signed in');
    const uid = context.auth.uid;
    const { action, type, granted, locale } = data || {};
    if (action === 'record') {
      if (!type || typeof granted !== 'boolean') {
        throw new functions.https.HttpsError('invalid-argument', 'type and granted are required');
      }
      await recordConsent(uid, { type, granted, locale });
      return { ok: true };
    }
    if (action === 'list') {
      return { consents: await listConsents(uid), policyVersion: POLICY_VERSION };
    }
    if (action === 'verify') {
      return await verifyRequiredConsents(uid);
    }
    throw new functions.https.HttpsError('invalid-argument', 'Unknown action');
  });

module.exports = { recordConsent, verifyRequiredConsents, listConsents, consentRef, CONSENT_TYPES, REQUIRED_CONSENTS };