'use strict';

/**
 * functions/src/middleware/lease.js
 *
 * Layer C — concurrency cap.  At most 1 active generation per session and 2
 * per user, enforced by lease docs acquired in a transaction with
 * expiresAt = now + function timeout.  Released in finally; stolen only
 * after expiry (R2).
 */
const admin = require('firebase-admin');

const db = () => admin.firestore();

const MAX_PER_USER = parseInt(process.env.MAX_CONCURRENT_PER_USER || '2', 10);
const MAX_PER_SESSION = parseInt(process.env.MAX_CONCURRENT_PER_SESSION || '1', 10);
const LEASE_MS = parseInt(process.env.LEASE_MS || String(5 * 60 * 1000), 10);

function leaseRef(uid, scope) {
  return db().collection('users').doc(uid).collection('leases').doc(scope);
}

async function acquire(uid, scope, { streamId, nowMs = Date.now() } = {}) {
  const ref = leaseRef(uid, scope);
  const max = scope === 'session' ? MAX_PER_SESSION : MAX_PER_USER;
  const result = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = nowMs;
    if (snap.exists) {
      const d = snap.data();
      const leases = d.leases || [];
      // Drop expired leases.
      const active = leases.filter(l => l.expiresAt && l.expiresAt > now);
      if (active.length >= max) {
        const retryAfter = active.length
          ? Math.min(...active.map(l => (l.expiresAt || 0) - now))
          : LEASE_MS;
        return { ok: false, retryAfter, active: active.length };
      }
      active.push({ streamId, acquiredAt: now, expiresAt: now + LEASE_MS });
      tx.update(ref, { leases: active, updatedAt: now });
      return { ok: true, active: active.length };
    }
    tx.set(ref, {
      scope,
      leases: [{ streamId, acquiredAt: now, expiresAt: now + LEASE_MS }],
      updatedAt: now,
    });
    return { ok: true, active: 1 };
  });
  return result;
}

async function release(uid, scope, streamId) {
  const ref = leaseRef(uid, scope);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const d = snap.data();
    const leases = (d.leases || []).filter(l => l.streamId !== streamId);
    if (!leases.length) tx.delete(ref);
    else tx.update(ref, { leases, updatedAt: Date.now() });
  });
}

async function releaseAll(uid) {
  const coll = db().collection('users').doc(uid).collection('leases');
  const snap = await coll.listDocuments();
  if (!snap.length) return;
  const batch = db().batch();
  snap.forEach(d => batch.delete(d));
  await batch.commit();
}

module.exports = { acquire, release, releaseAll, MAX_PER_USER, MAX_PER_SESSION, LEASE_MS };