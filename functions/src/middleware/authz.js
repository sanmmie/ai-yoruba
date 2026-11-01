'use strict';
const admin = require('firebase-admin');
const { checkRateLimits } = require('../middleware/rateLimit');
const { plans } = require('../config/plans');

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
  const snaps = await Promise.all(types.map(t => db.doc(users//consents/).get()));
  return snaps.every(s => {
    if (!s.exists) return false;
    const d = s.data();
    return d.granted === true && d.withdrawnAt == null && (d.policyVersion === policy || policy === 'VERIFY');
  });
}

async function authorize(req, { sessionId, requestId, streamId } = {}) {
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
  const rl = await checkRateLimits({ uid, req, plan });
  if (rl.blocked) {
    const e = new Error(rl.code === 'quota_exceeded' ? 'quota_exceeded' : 'rate_limited');
    e.code = rl.code;
    e.retryAfter = rl.retryAfter;
    throw e;
  }
  return { uid, token, plan, quota: rl.quota, userRef, requestId, streamId, reservationId: rl.reservationId };
}

async function settle(auth, { success }) {
  const { refundReservation } = require('../middleware/rateLimit');
  try {
    if (auth?.reservationId) {
      await refundReservation({ uid: auth.uid, reservationId: auth.reservationId, success });
    }
  } catch (e) {}
}

module.exports = { authorize, settle, ERR, verifyConsent };
