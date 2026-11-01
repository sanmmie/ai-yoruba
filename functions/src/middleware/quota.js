'use strict';

/**
 * functions/src/middleware/quota.js
 *
 * Daily quota reservation with refund (R1) and idempotent retries (R4).
 *
 * One usage doc per uid per Lagos day: usage/{uid}_{YYYYMMDD}, server-only.
 * Reserve inside a transaction: if count >= limit reject, else increment
 * and create reservations/{requestId} in state "reserved".  The caller
 * commits the reservation to "committed" on stream completion or refunds it
 * to "refunded" on failure.  A scheduled function refunds reservations
 * stuck in "reserved" past the function timeout.
 *
 * The clientRequestId is stored on the reservation so a retry of the same
 * id returns the existing outcome instead of charging twice (R4).
 */
const admin = require('firebase-admin');

const db = () => admin.firestore();

function getLagosDateString() {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function usageKey(uid, dateStr) {
  return `${uid}_${dateStr}`;
}

function reservationRef(requestId) {
  return db().collection('reservations').doc(requestId);
}

async function reserve(uid, limit, requestId, { nowMs = Date.now() } = {}) {
  const dateStr = getLagosDateString();
  const usageRef = db().collection('usage').doc(usageKey(uid, dateStr));

  const result = await db().runTransaction(async (tx) => {
    const usageSnap = await tx.get(usageRef);
    let count = 0;
    if (usageSnap.exists) {
      const d = usageSnap.data();
      if (d.date === dateStr) count = d.count ?? 0;
    }
    if (count >= limit) {
      return { ok: false, remaining: 0, limit, reason: 'daily_limit' };
    }
    const newCount = count + 1;
    tx.set(usageRef, { uid, date: dateStr, count: newCount, updatedAt: nowMs }, { merge: true });

    const resRef = reservationRef(requestId);
    const resSnap = await tx.get(resRef);
    if (resSnap.exists) {
      // Idempotent retry (R4): the same clientRequestId already charged.
      const existing = resSnap.data();
      if (existing.uid === uid && existing.state === 'committed') {
        return { ok: true, remaining: Math.max(0, limit - newCount), limit, alreadyCharged: true };
      }
      if (existing.uid === uid && existing.state === 'reserved') {
        return { ok: true, remaining: Math.max(0, limit - newCount), limit, reused: true };
      }
      // Different uid or terminal state — treat as a fresh reservation.
    }
    tx.set(resRef, {
      uid,
      requestId,
      state: 'reserved',
      date: dateStr,
      count: 1,
      createdAt: nowMs,
      expiresAt: nowMs + 30 * 60 * 1000,
    });
    return { ok: true, remaining: Math.max(0, limit - newCount), limit };
  });
  return result;
}

async function commit(requestId) {
  return setState(requestId, 'committed');
}

async function refund(requestId) {
  return setState(requestId, 'refunded');
}

async function setState(requestId, state) {
  const resRef = reservationRef(requestId);
  const dateStr = getLagosDateString();
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(resRef);
    if (!snap.exists) return;
    const d = snap.data();
    if (state === 'refunded' && d.state !== 'reserved') return; // no-op
    if (state === 'committed' && d.state === 'committed') return; // no-op
    tx.update(resRef, { state, updatedAt: Date.now() });
    if (state === 'refunded' && d.uid) {
      const usageRef = db().collection('usage').doc(usageKey(d.uid, d.date || dateStr));
      const u = await tx.get(usageRef);
      if (u.exists && (u.data().count ?? 0) > 0) {
        tx.update(usageRef, { count: admin.firestore.FieldValue.increment(-1) });
      }
    }
  });
}

async function getRemaining(uid, limit) {
  const dateStr = getLagosDateString();
  const usageRef = db().collection('usage').doc(usageKey(uid, dateStr));
  const snap = await usageRef.get();
  if (!snap.exists) return { remaining: limit, limit };
  const d = snap.data();
  if (d.date !== dateStr) return { remaining: limit, limit };
  return { remaining: Math.max(0, limit - (d.count ?? 0)), limit };
}

module.exports = { reserve, commit, refund, getRemaining, usageKey, reservationRef };