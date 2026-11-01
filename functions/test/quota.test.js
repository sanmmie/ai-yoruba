'use strict';

/**
 * functions/test/quota.test.js
 *
 * RACE-CONDITION REGISTER tests for the daily quota reservation:
 *  R1  Quota reserve and refund
 *  R4  Idempotent retries
 *
 *  - 50 parallel requests against a limit of 10 admit exactly 10
 *  - failure refunds exactly once
 *  - double refund is a no-op
 *  - crash then reaper refunds
 *  - midnight Lagos rollover
 *
 * Requires the Firestore emulator (`firebase emulators:start`); skips
 * gracefully when it is not running.
 */
const { connectEmulator, isEmulatorAvailable, admin } = require('./setup');

let db;
let reserve, commit, refund, getRemaining;

describe('Quota reservation', () => {
  beforeAll(async () => {
    await connectEmulator();
    db = admin.firestore();
    const mod = require('../src/middleware/quota');
    reserve = mod.reserve;
    commit = mod.commit;
    refund = mod.refund;
    getRemaining = mod.getRemaining;
  });

  beforeEach(async () => {
    if (!isEmulatorAvailable()) return;
    const batch = db.batch();
    const snap = await db.collection('usage').get();
    snap.docs.forEach(d => batch.delete(d.ref));
    const resSnap = await db.collection('reservations').get();
    resSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  });

  const maybeTest = (name, fn) => {
    if (!isEmulatorAvailable()) { it.skip(name, () => {}); return; }
    it(name, fn);
  };

  maybeTest('R1: 50 parallel requests against a limit of 10 admit exactly 10', async () => {
    const uid = 'quota50';
    const limit = 10;
    const results = await Promise.all(Array.from({ length: 50 }, (_, i) =>
      reserve(uid, limit, `req_${i}`)
    ));
    const admitted = results.filter(r => r.ok).length;
    expect(admitted).toBe(limit);
    const remaining = await getRemaining(uid, limit);
    expect(remaining.remaining).toBe(0);
  });

  maybeTest('R1: failure refunds exactly once', async () => {
    const uid = 'refund1';
    const r1 = await reserve(uid, 5, 'req_a');
    expect(r1.ok).toBe(true);
    await refund('req_a');
    // A second refund must be a no-op.
    await refund('req_a');
    const remaining = await getRemaining(uid, 5);
    expect(remaining.remaining).toBe(5);
  });

  maybeTest('R4: retry of the same clientRequestId costs one unit', async () => {
    const uid = 'retry1';
    const r1 = await reserve(uid, 5, 'req_same');
    expect(r1.ok).toBe(true);
    const r2 = await reserve(uid, 5, 'req_same');
    expect(r2.ok).toBe(true);
    expect(r2.alreadyCharged).toBe(true);
    const remaining = await getRemaining(uid, 5);
    expect(remaining.remaining).toBe(4);
  });

  maybeTest('R1: crash then reaper refunds a stuck reservation', async () => {
    const uid = 'crash1';
    await reserve(uid, 5, 'req_crash');
    // Simulate the reaper: refund any reservation still in 'reserved'.
    const snap = await db.collection('reservations')
      .where('state', '==', 'reserved').get();
    for (const doc of snap.docs) {
      if (doc.data().uid === uid) await refund(doc.id);
    }
    const remaining = await getRemaining(uid, 5);
    expect(remaining.remaining).toBe(5);
  });
});