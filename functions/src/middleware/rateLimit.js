'use strict';
const admin = require('firebase-admin');
const crypto = require('crypto');
const { plans } = require('../config/plans');

const CLIENT_REQUEST_ID_RE = /^[A-Za-z0-9:_-]{8,128}$/;
const PENDING_STALE_MS = 10 * 60 * 1000;

function getLagosDateKey() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(now);
}
function hashIp(ip) {
  if (!ip) return 'unknown';
  const salt = process.env.IP_SALT || 'ygpt';
  return crypto.createHash('sha256').update(salt + ip).digest('hex').slice(0, 16);
}
function stablePayloadHash(payload) {
  const obj = payload && typeof payload === 'object' ? payload : {};
  const normalized = {
    sessionId: obj.sessionId || null,
    message: typeof obj.message === 'string' ? obj.message : '',
    mode: obj.mode || null,
    regenerate: !!obj.regenerate,
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
function isValidClientRequestId(id) { return typeof id === 'string' && CLIENT_REQUEST_ID_RE.test(id); }
function requestDocId(uid, clientRequestId) { return uid + '__' + clientRequestId; }
function quotaViewFromUsage(count, limit) { return { remaining: Math.max(0, limit - (count || 0)), limit }; }
function doneFromReservation(r, quota) {
  if (r && r.result && r.result.done) return r.result.done;
  return { messageId: (r && (r.messageId || r.assistantMessageId)) || '', remaining: quota?.remaining ?? null, limit: quota?.limit ?? null };
}

// State machine:
// (none)->reserved (usage+1). reserved->generated (persisted, pending settlement, NO AI regen).
// reserved->committed|refunded(usage-1)|failed(stale marker). generated->committed (kept).
// generated recovery: return stored result and commit without AI regen.
// committed->replay (no accounting change). refunded|failed->reserved (retry, usage+1).
// Prohibited: committed->reserved/refunded/generated; payload mismatch on same ID;
// generated->refunded (persisted generated response is recovered/committed, not refunded).
// Invariant: each usage increment has exactly one final outcome: committed(kept) OR refunded/decremented once.
// generated is pending-final and retains the reserved unit until committed.

async function checkRateLimits({ uid, req: _req, plan, clientRequestId, payload, dailyLimit: dailyLimitOverride } = {}) {
  const db = admin.firestore();
  const cfg = plans[plan] || plans.free;
  const dailyLimit = Number.isFinite(dailyLimitOverride) ? dailyLimitOverride : cfg.dailyLimit;
  const dateKey = getLagosDateKey();
  const usageRef = db.collection('usage').doc(uid + '_' + dateKey);
  const hasClientId = clientRequestId !== null && clientRequestId !== undefined && clientRequestId !== '';
  if (hasClientId && !isValidClientRequestId(clientRequestId)) {
    return { blocked: true, code: 'invalid_argument', message: 'Invalid clientRequestId.' };
  }
  const payloadHash = stablePayloadHash(payload);
  const reservationId = hasClientId ? clientRequestId : 'srv_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');
  const reservationRef = db.collection('reservations').doc(requestDocId(uid, reservationId));
  const now = Date.now();

  try {
    return await db.runTransaction(async (tx) => {
      const usageSnap = await tx.get(usageRef);
      const count = usageSnap.exists ? (usageSnap.data().count || 0) : 0;
      const quota = quotaViewFromUsage(count, dailyLimit);
      const replayResult = (r) => (r.result || { done: doneFromReservation(r, quota) });

      if (hasClientId) {
        const resSnap = await tx.get(reservationRef);
        if (resSnap.exists) {
          const r = resSnap.data() || {};
          if (r.uid && r.uid !== uid) return { blocked: true, code: 'idempotency_conflict', message: 'Request ID conflict.' };
          if (r.payloadHash && r.payloadHash !== payloadHash) return { blocked: true, code: 'idempotency_payload_mismatch', message: 'clientRequestId was already used with a different request payload.' };
          if (r.state === 'committed') return { blocked: false, reservationId, quota, idempotent: true, replay: replayResult(r) };
          if (r.state === 'generated') return { blocked: false, reservationId, quota, recoverGenerated: true, replay: replayResult(r) };
          if (r.state === 'refunded' || r.state === 'failed') {
            if (count >= dailyLimit) return { blocked: true, code: 'quota_exceeded' };
            tx.set(usageRef, { count: count + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp(), dateKey }, { merge: true });
            tx.set(reservationRef, {
              uid, requestId: reservationId, state: 'reserved', dateKey, payloadHash,
              createdAt: r.createdAt || admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(), reservedAtMs: now,
              attempts: (r.attempts || 0) + 1, completionState: 'reserved',
              result: admin.firestore.FieldValue.delete(), error: admin.firestore.FieldValue.delete(), messageId: admin.firestore.FieldValue.delete(),
              assistantMessageId: admin.firestore.FieldValue.delete(), generationState: admin.firestore.FieldValue.delete(), lastSettlementError: admin.firestore.FieldValue.delete(),
            }, { merge: true });
            return { blocked: false, reservationId, quota: quotaViewFromUsage(count + 1, dailyLimit), retried: true };
          }
          if (r.state === 'reserved') {
            const age = now - (r.reservedAtMs || (r.createdAt && r.createdAt.toMillis ? r.createdAt.toMillis() : 0) || 0);
            if (age > 0 && age < PENDING_STALE_MS) return { blocked: true, code: 'idempotency_conflict', message: 'Request is already in progress.' };
            tx.set(reservationRef, { state: 'failed', updatedAt: admin.firestore.FieldValue.serverTimestamp(), error: { code: 'stale_pending', message: 'Previous attempt timed out before completion.' }, completionState: 'failed' }, { merge: true });
            const refundedCount = Math.max(0, count - 1);
            if (refundedCount >= dailyLimit) {
              tx.set(usageRef, { count: refundedCount, updatedAt: admin.firestore.FieldValue.serverTimestamp(), dateKey }, { merge: true });
              return { blocked: true, code: 'quota_exceeded' };
            }
            tx.set(usageRef, { count: refundedCount + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp(), dateKey }, { merge: true });
            tx.set(reservationRef, {
              uid, requestId: reservationId, state: 'reserved', dateKey, payloadHash,
              createdAt: r.createdAt || admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(), reservedAtMs: now,
              attempts: (r.attempts || 0) + 1, recoveredFrom: 'stale_reserved', completionState: 'reserved',
              result: admin.firestore.FieldValue.delete(), error: admin.firestore.FieldValue.delete(), messageId: admin.firestore.FieldValue.delete(),
              assistantMessageId: admin.firestore.FieldValue.delete(), generationState: admin.firestore.FieldValue.delete(), lastSettlementError: admin.firestore.FieldValue.delete(),
            }, { merge: true });
            return { blocked: false, reservationId, quota: quotaViewFromUsage(refundedCount + 1, dailyLimit), recovered: true };
          }
        }
      }

      if (count >= dailyLimit) return { blocked: true, code: 'quota_exceeded' };
      tx.set(usageRef, { count: count + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp(), dateKey }, { merge: true });
      tx.set(reservationRef, {
        uid, requestId: reservationId, state: 'reserved', dateKey, payloadHash: hasClientId ? payloadHash : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(), reservedAtMs: now,
        attempts: 1, completionState: 'reserved',
      }, { merge: true });
      return { blocked: false, reservationId, quota: quotaViewFromUsage(count + 1, dailyLimit) };
    });
  } catch (e) {
    if (plan === 'premium') return { blocked: false, reservationId, quota: { remaining: null, limit: plans.premium.dailyLimit } };
    return { blocked: true, code: 'rate_limited' };
  }
}

async function markGenerated({ uid, reservationId, result, sessionId }) {
  const db = admin.firestore();
  const reservationRef = db.collection('reservations').doc(requestDocId(uid, reservationId));
  await db.runTransaction(async (tx) => {
    const rSnap = await tx.get(reservationRef);
    if (!rSnap.exists) return;
    const r = rSnap.data() || {};
    if (r.uid && r.uid !== uid) return;
    if (r.state === 'committed') return;
    if (r.state === 'generated' && r.result && r.result.done) return;
    if (r.state !== 'reserved' && r.state !== 'generated') return;
    const patch = {
      state: 'generated', generatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      generationState: 'generated', completionState: 'pending_settlement',
    };
    if (result && typeof result === 'object') patch.result = result;
    if (result && result.messageId) { patch.messageId = result.messageId; patch.assistantMessageId = result.messageId; }
    if (sessionId) patch.sessionId = sessionId;
    tx.set(reservationRef, patch, { merge: true });
  });
}

async function refundReservation({ uid, reservationId, success, result, error }) {
  const db = admin.firestore();
  const reservationRef = db.collection('reservations').doc(requestDocId(uid, reservationId));
  await db.runTransaction(async (tx) => {
    const rSnap = await tx.get(reservationRef);
    if (!rSnap.exists) return;
    const r = rSnap.data() || {};
    if (r.uid && r.uid !== uid) return;
    if (r.state === 'committed' || r.state === 'refunded' || r.state === 'failed') return;
    const usageRef = db.collection('usage').doc(uid + '_' + (r.dateKey || getLagosDateKey()));
    if (success) {
      if (r.state !== 'reserved' && r.state !== 'generated') return;
      const finalResult = (result && typeof result === 'object') ? result : (r.result || {});
      const patch = { state: 'committed', committedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(), completionState: 'committed', result: finalResult };
      if (finalResult.messageId) { patch.messageId = finalResult.messageId; patch.assistantMessageId = finalResult.messageId; }
      tx.set(reservationRef, patch, { merge: true });
      return;
    }
    if (r.state === 'generated') {
      tx.set(reservationRef, { updatedAt: admin.firestore.FieldValue.serverTimestamp(), completionState: 'pending_settlement', lastSettlementError: error ? { code: error.code || 'error', message: error.message || 'Settlement failed after generation.' } : { code: 'error', message: 'Settlement failed after generation.' } }, { merge: true });
      return;
    }
    if (r.state !== 'reserved') return;
    tx.set(reservationRef, { state: 'refunded', refundedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(), completionState: 'refunded', error: error ? { code: error.code || 'error', message: error.message || 'Request failed.' } : { code: 'error', message: 'Request failed.' } }, { merge: true });
    const uSnap = await tx.get(usageRef);
    if (uSnap.exists) {
      const count = uSnap.data().count || 0;
      tx.set(usageRef, { count: Math.max(0, count - 1), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
  });
}

module.exports = {
  checkRateLimits, refundReservation, markGenerated,
  getLagosDateKey, hashIp, stablePayloadHash, isValidClientRequestId, requestDocId, doneFromReservation,
  CLIENT_REQUEST_ID_RE, PENDING_STALE_MS,
};
