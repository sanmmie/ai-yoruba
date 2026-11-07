'use strict';
const admin = require('firebase-admin');
const { checkRateLimits } = require('../middleware/rateLimit');

const ERR = {
  unauthenticated: { code: 'unauthenticated', message: 'Authentication required.' },
  consent_required: { code: 'consent_required', message: 'Consent required.' },
  rate_limited: { code: 'rate_limited', message: 'Too many requests.' },
  quota_exceeded: { code: 'quota_exceeded', message: 'Daily quota exceeded.' },
  invalid_argument: { code: 'invalid_argument', message: 'Invalid request.' },
  internal: { code: 'internal', message: 'Internal error.' },
};

async function verifyConsent(uid) {
  const db = admin.firestore();
  const policy = process.env.POLICY_VERSION || 'VERIFY';
  const types = ['terms_privacy', 'age_18'];
  const snaps = await Promise.all(types.map(t => db.doc(`users/${uid}/consents/${t}`).get()));
  return snaps.every(s => {
    if (!s.exists) return false;
    const d = s.data();
    return d.granted === true && d.withdrawnAt === null && (d.policyVersion === policy || policy === 'VERIFY');
  });
}

async function authorize(req, { sessionId: _sessionId, requestId, streamId, payload } = {}) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    const e = new Error('unauthenticated');
    e.code = 'unauthenticated';
    throw e;
  }
  const token = await admin.auth().verifyIdToken(authHeader.slice(7), true);
  const uid = token.uid;
  const db = admin.firestore();
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const sub = userData.subscription || {};
  const plan = sub.plan === 'premium' && sub.status === 'active' ? 'premium' : 'free';
  const consentOk = await verifyConsent(uid);
  if (!consentOk) {
    const e = new Error('consent_required');
    e.code = 'consent_required';
    throw e;
  }
  const rl = await checkRateLimits({ uid, req, plan, clientRequestId: requestId, payload });
  if (rl.blocked) {
    const e = new Error(rl.message || (rl.code === 'quota_exceeded' ? 'quota_exceeded' : 'rate_limited'));
    e.code = rl.code;
    e.retryAfter = rl.retryAfter;
    throw e;
  }
  return {
    uid, token, plan, quota: rl.quota, userRef,
    requestId: requestId || rl.reservationId,
    streamId,
    reservationId: rl.reservationId,
    idempotentReplay: rl.idempotent ? (rl.replay || { done: { messageId: '', remaining: rl.quota?.remaining ?? null, limit: rl.quota?.limit ?? null } }) : null,
    recoverGenerated: !!rl.recoverGenerated,
  };
}

async function markGenerated(auth, { result, sessionId } = {}) {
  const { markGenerated: mg } = require('../middleware/rateLimit');
  try { if (auth?.reservationId && auth?.uid) await mg({ uid: auth.uid, reservationId: auth.reservationId, result, sessionId }); } catch (e) {}
}

async function settle(auth, { success, result, error }) {
  const { refundReservation } = require('../middleware/rateLimit');
  try {
    if (auth?.reservationId && auth?.uid) {
      await refundReservation({ uid: auth.uid, reservationId: auth.reservationId, success, result, error });
    }
  } catch (e) {}
}

module.exports = { authorize, settle, markGenerated, ERR, verifyConsent };
