'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { corsMiddleware } = require('../utils/cors');

// Set POLICY_VERSION in your Firebase Functions environment.
// Use a real version in production, not VERIFY.
const POLICY_VERSION = process.env.POLICY_VERSION || '1.0.0';

const REQUIRED_CONSENTS = ['terms_privacy', 'age_18'];

const ALLOWED_CONSENTS = [
  'terms_privacy',
  'age_18',
  'training',
  'analytics',
];

const CONSENT_COLLECTION = 'consents';

/**
 * Returns a Firestore reference for a user's consent record.
 */
function getConsentRef(db, uid, type) {
  return db.doc(`users/${uid}/${CONSENT_COLLECTION}/${type}`);
}

/**
 * Firebase Authentication middleware.
 */
async function authenticateRequest(req) {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    const error = new Error('unauthenticated');
    error.statusCode = 401;
    throw error;
  }

  const idToken = authHeader.slice(7).trim();

  if (!idToken) {
    const error = new Error('unauthenticated');
    error.statusCode = 401;
    throw error;
  }

  return admin.auth().verifyIdToken(idToken);
}

/**
 * Records or updates an individual consent decision.
 */
async function recordConsent(db, uid, type, granted, locale) {
  const ref = getConsentRef(db, uid, type);
  const consentGranted = granted === true;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);

    const existing = snapshot.exists ? snapshot.data() : null;

    const isAlreadyCurrent =
      existing &&
      existing.granted === consentGranted &&
      existing.policyVersion === POLICY_VERSION &&
      (
        consentGranted
          ? existing.withdrawnAt === null
          : existing.withdrawnAt !== null
      );

    if (isAlreadyCurrent) {
      return;
    }

    transaction.set(
      ref,
      {
        type,
        granted: consentGranted,
        policyVersion: POLICY_VERSION,
        locale: locale || existing?.locale || 'en',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        withdrawnAt: consentGranted
          ? null
          : admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

/**
 * Verifies required consent records.
 */
async function verifyConsents(db, uid) {
  const snapshots = await Promise.all(
    REQUIRED_CONSENTS.map((type) => getConsentRef(db, uid, type).get())
  );

  const ok = snapshots.every((snapshot) => {
    if (!snapshot.exists) {
      return false;
    }

    const data = snapshot.data();

    return (
      data.granted === true &&
      data.withdrawnAt === null &&
      (
        POLICY_VERSION === 'VERIFY' ||
        data.policyVersion === POLICY_VERSION
      )
    );
  });

  return { ok };
}

/**
 * Lists all consent records for the authenticated user.
 */
async function listConsents(db, uid) {
  const snapshot = await db
    .collection(`users/${uid}/${CONSENT_COLLECTION}`)
    .get();

  const consents = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  return { consents };
}

/**
 * Withdraws an individual consent decision.
 */
async function withdrawConsent(db, uid, type) {
  const ref = getConsentRef(db, uid, type);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists) {
      return;
    }

    const existing = snapshot.data();

    // Avoid repeatedly changing the withdrawal timestamp.
    if (
      existing.granted === false &&
      existing.withdrawnAt !== null
    ) {
      return;
    }

    transaction.set(
      ref,
      {
        granted: false,
        withdrawnAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

/**
 * Main consent endpoint.
 */
exports.consentFunctions = functions
  .region('us-central1')
  .https.onRequest((req, res) => {
    corsMiddleware(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({
            error: 'method_not_allowed',
          });
        }

        const token = await authenticateRequest(req);
        const uid = token.uid;

        const {
          action,
          type,
          granted,
          locale,
        } = req.body || {};

        const db = admin.firestore();

        switch (action) {
          case 'verify': {
            const result = await verifyConsents(db, uid);
            return res.status(200).json(result);
          }

          case 'record': {
            if (!ALLOWED_CONSENTS.includes(type)) {
              return res.status(400).json({
                error: 'invalid_type',
              });
            }

            if (typeof granted !== 'boolean') {
              return res.status(400).json({
                error: 'invalid_granted_value',
              });
            }

            if (
              locale !== undefined &&
              (typeof locale !== 'string' || locale.length > 20)
            ) {
              return res.status(400).json({
                error: 'invalid_locale',
              });
            }

            await recordConsent(
              db,
              uid,
              type,
              granted,
              locale
            );

            return res.status(200).json({
              ok: true,
            });
          }

          case 'list': {
            const result = await listConsents(db, uid);
            return res.status(200).json(result);
          }

          case 'withdraw': {
            if (!ALLOWED_CONSENTS.includes(type)) {
              return res.status(400).json({
                error: 'invalid_type',
              });
            }

            await withdrawConsent(db, uid, type);

            return res.status(200).json({
              ok: true,
            });
          }

          default:
            return res.status(400).json({
              error: 'invalid_action',
            });
        }
      } catch (error) {
        console.error('[consentFunctions]', {
          message: error.message,
          code: error.code,
        });

        if (error.statusCode === 401) {
          return res.status(401).json({
            error: 'unauthenticated',
          });
        }

        if (
          error.code === 'auth/id-token-expired' ||
          error.code === 'auth/argument-error' ||
          error.code === 'auth/invalid-id-token'
        ) {
          return res.status(401).json({
            error: 'unauthenticated',
          });
        }

        return res.status(500).json({
          error: 'internal',
        });
      }
    });
  });