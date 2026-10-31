'use strict';

/**
 * functions/src/middleware/authz.js
 *
 * Shared authz helpers for the chat endpoint: ID token verification with
 * checkRevoked, consent gate, burst limit, IP limit, lease and quota.
 * Fails closed for free users on any Firestore error.
 */
const admin = require('firebase-admin');
const { checkBurst, checkIp, clientIp } = require('./rateLimiter');
const { requireConsents } = require('./consentGate');
const { checkQuota, commitQuota, refundQuota } = require('./subscriptionGate');
const { acquire, release } = require('./lease');
const { getPlan } = require('./subscriptionGate');

const ERR = {
  unauthenticated: { code: 'unauthenticated', message: 'Not signed in' },
  consent_required: { code: 'consent_required', message: 'Consent required' },
  rate_limited: { code: 'rate_limited', message: 'Too many requests' },
  quota_exhausted: { code: 'quota_exhausted', message: 'Daily limit reached' },
  busy: { code: 'busy', message: 'Session is busy' },
  invalid_argument: { code: 'invalid-argument', message: 'Invalid argument' },
  internal: { code: 'internal', message: 'Internal error' },
};

async function verifyToken(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw Object.assign(new Error('unauthenticated'), { code: 'unauthenticated' });
  try {
    const decoded = await admin.auth().verifyIdToken(token, true); // checkRevoked
    return decoded;
  } catch (e) {
    throw Object.assign(new Error('unauthenticated'), { code: 'unauthenticated' });
  }
}

async function authorize(req, { sessionId, requestId, streamId, anonymous = false }) {
  const decoded = await verifyToken(req);
  const uid = decoded.uid;

  // Consent gate (R13): evaluated at reservation time.
  try { await requireConsents(uid); }
  catch (e) { if (e.code === 'consent_required') throw e; throw e; }

  // Burst limit per UID.
  const { plan } = await getPlan(uid);
  const burst = await checkBurst(uid, plan);
  if (!burst.allowed) {
    throw Object.assign(new Error('rate_limited'), { code: 'rate_limited', retryAfter: burst.retryAfter });
  }

  // IP limit — generous for signed-in users, tighter for anonymous.
  const ip = clientIp(req);
  const ipCheck = await checkIp(ip, { anonymous });
  if (!ipCheck.allowed) {
    throw Object.assign(new Error('rate_limited'), { code: 'rate_limited', retryAfter: ipCheck.retryAfter });
  }

  // Lease (R2): at most 1 active generation per session, 2 per user.
  const lease = await acquire(uid, 'user', { streamId });
  if (!lease.ok) {
    throw Object.assign(new Error('busy'), { code: 'busy', retryAfter: lease.retryAfter });
  }
  let sessionLease = null;
  if (sessionId) {
    sessionLease = await acquire(uid, `session:${sessionId}`, { streamId });
    if (!sessionLease.ok) {
      await release(uid, 'user', streamId);
      throw Object.assign(new Error('busy'), { code: 'busy', retryAfter: sessionLease.retryAfter });
    }
  }

  // Quota reservation (R1, R4).
  const quota = await checkQuota(uid, requestId);
  if (!quota.allowed) {
    await release(uid, 'user', streamId);
    if (sessionLease) await release(uid, `session:${sessionId}`, streamId);
    throw Object.assign(new Error('quota_exhausted'), { code: 'quota_exhausted', remaining: 0, limit: quota.limit });
  }

  return {
    uid, plan: quota.plan, quota,
    release: async () => {
      await release(uid, 'user', streamId);
      if (sessionLease) await release(uid, `session:${sessionId}`, streamId);
    },
  };
}

async function settle(auth, { success, requestId }) {
  try {
    if (success) await commitQuota(requestId);
    else await refundQuota(requestId);
  } finally {
    await auth.release();
  }
}

module.exports = { authorize, settle, verifyToken, ERR };