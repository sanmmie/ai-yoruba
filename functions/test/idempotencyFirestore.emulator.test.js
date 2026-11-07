const { connectEmulator, isEmulatorAvailable, admin } = require('./setup');

let db;
let checkRateLimits, refundReservation, markGenerated, requestDocId, getLagosDateKey;

describe('D2 idempotency Firestore (emulator)', () => {
  beforeAll(async () => {
    await connectEmulator();
    db = admin.firestore();
    const mod = require('../src/middleware/rateLimit');
    checkRateLimits = mod.checkRateLimits;
    refundReservation = mod.refundReservation;
    markGenerated = mod.markGenerated;
    requestDocId = mod.requestDocId;
    getLagosDateKey = mod.getLagosDateKey;
  });

  beforeEach(async () => {
    if (!isEmulatorAvailable()) return;
    for (const col of ['usage', 'reservations']) {
      const snap = await db.collection(col).get();
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  });

  const maybe = (name, fn) => (isEmulatorAvailable() ? it(name, fn) : it.skip(name, () => {}));
  const payload = (m = 'Bawo ni?') => ({ sessionId: 'sess_1', message: m, mode: 'chat', regenerate: false });
  const doneResult = (id='m1') => ({ messageId: id, done: { messageId: id, remaining: 9, limit: 10 } });

  async function usageCount(uid) {
    const key = `${uid}_${getLagosDateKey()}`;
    const snap = await db.collection('usage').doc(key).get();
    return snap.exists ? (snap.data().count || 0) : 0;
  }
  async function resState(uid, requestId) {
    const snap = await db.collection('reservations').doc(requestDocId(uid, requestId)).get();
    return snap.exists ? snap.data() : null;
  }

  maybe('1) two simultaneous same ID+payload: one logical reservation/charge', async () => {
    const uid = 'u_concurrent_same';
    const [a, b] = await Promise.all([
      checkRateLimits({ uid, plan: 'premium', clientRequestId: 'req_same_12345678', payload: payload(), dailyLimit: 10 }),
      checkRateLimits({ uid, plan: 'premium', clientRequestId: 'req_same_12345678', payload: payload(), dailyLimit: 10 }),
    ]);
    const reserved = [a, b].filter(r => !r.blocked && !r.idempotent && !r.recoverGenerated).length;
    const conflictOrReplay = [a, b].filter(r => (r.blocked && r.code === 'idempotency_conflict') || r.idempotent || r.recoverGenerated).length;
    expect(reserved).toBe(1);
    expect(reserved + conflictOrReplay).toBe(2);
    expect(await usageCount(uid)).toBe(1);
    const r = await resState(uid, 'req_same_12345678');
    expect(['reserved', 'generated', 'committed']).toContain(r.state);
  });

  maybe('2) same ID different payload rejected', async () => {
    const uid = 'u_mismatch';
    await checkRateLimits({ uid, plan: 'premium', clientRequestId: 'req_mis_12345678', payload: payload('one'), dailyLimit: 10 });
    const second = await checkRateLimits({ uid, plan: 'premium', clientRequestId: 'req_mis_12345678', payload: payload('two'), dailyLimit: 10 });
    expect(second.blocked).toBe(true);
    expect(second.code).toBe('idempotency_payload_mismatch');
    expect(await usageCount(uid)).toBe(1);
  });

  maybe('3) retry after committed success: replay, no second charge', async () => {
    const uid = 'u_replay'; const reqId = 'req_commit_12345678'; const p = payload();
    await checkRateLimits({ uid, plan: 'premium', clientRequestId: reqId, payload: p, dailyLimit: 10 });
    await markGenerated({ uid, reservationId: reqId, result: doneResult('m1'), sessionId: 'sess_1' });
    await refundReservation({ uid, reservationId: reqId, success: true, result: doneResult('m1') });
    const replay = await checkRateLimits({ uid, plan: 'premium', clientRequestId: reqId, payload: p, dailyLimit: 10 });
    expect(replay.idempotent).toBe(true);
    expect((replay.replay?.done?.messageId || replay.replay?.messageId)).toBe('m1');
    expect(await usageCount(uid)).toBe(1);
    expect((await resState(uid, reqId)).state).toBe('committed');
  });

  maybe('4) retry after refund/failure: re-reserved and charged once for retry', async () => {
    const uid = 'u_retry_fail'; const reqId = 'req_fail_12345678'; const p = payload();
    await checkRateLimits({ uid, plan: 'premium', clientRequestId: reqId, payload: p, dailyLimit: 10 });
    await refundReservation({ uid, reservationId: reqId, success: false, error: { code: 'ai' } });
    expect(await usageCount(uid)).toBe(0);
    expect((await resState(uid, reqId)).state).toBe('refunded');
    const retry = await checkRateLimits({ uid, plan: 'premium', clientRequestId: reqId, payload: p, dailyLimit: 10 });
    expect(retry.blocked).toBeFalsy();
    expect(retry.retried).toBe(true);
    expect(await usageCount(uid)).toBe(1);
    expect((await resState(uid, reqId)).state).toBe('reserved');
  });

  maybe('5) stale reserved recovery: refunds prior unit once, re-reserves, no double charge', async () => {
    const uid = 'u_stale'; const reqId = 'req_stale_12345678'; const p = payload();
    await checkRateLimits({ uid, plan: 'premium', clientRequestId: reqId, payload: p, dailyLimit: 10 });
    expect(await usageCount(uid)).toBe(1);
    await db.collection('reservations').doc(requestDocId(uid, reqId)).set({ reservedAtMs: Date.now() - 11 * 60 * 1000 }, { merge: true });
    const retry = await checkRateLimits({ uid, plan: 'premium', clientRequestId: reqId, payload: p, dailyLimit: 10 });
    expect(retry.blocked).toBeFalsy();
    expect(retry.recovered).toBe(true);
    expect((await resState(uid, reqId)).state).toBe('reserved');
    expect(await usageCount(uid)).toBe(1); // refund prior + reserve new = net 1
  });

  maybe('6) settlement failure before generation: refunded once, usage decremented once', async () => {
    const uid = 'u_settle_fail'; const reqId = 'req_sfail_12345678';
    await checkRateLimits({ uid, plan: 'premium', clientRequestId: reqId, payload: payload(), dailyLimit: 10 });
    expect(await usageCount(uid)).toBe(1);
    await refundReservation({ uid, reservationId: reqId, success: false, error: { code: 'ai' } });
    expect(await usageCount(uid)).toBe(0);
    expect((await resState(uid, reqId)).state).toBe('refunded');
  });

  maybe('7) duplicate settlement calls: exactly-once effect', async () => {
    const uid = 'u_dupsettle'; const reqId = 'req_dupst_12345678';
    await checkRateLimits({ uid, plan: 'premium', clientRequestId: reqId, payload: payload(), dailyLimit: 10 });
    await markGenerated({ uid, reservationId: reqId, result: doneResult('x'), sessionId: 'sess_1' });
    await refundReservation({ uid, reservationId: reqId, success: true, result: doneResult('x') });
    await refundReservation({ uid, reservationId: reqId, success: false, error: { code: 'ai' } });
    await refundReservation({ uid, reservationId: reqId, success: true, result: doneResult('y') });
    expect((await resState(uid, reqId)).state).toBe('committed');
    expect(await usageCount(uid)).toBe(1);
  });

  maybe('8) free-plan quota boundary with controlled limit: admit up to limit, reject over, concurrent cannot exceed', async () => {
    const uid = 'u_free_limit'; const limit = 3; const plan = 'free';
    const opts = (id, m) => ({ uid, plan, clientRequestId: id, payload: payload(m), dailyLimit: limit });
    const a = await checkRateLimits(opts('req_f_1__12345678','1')); expect(a.blocked).toBeFalsy();
    const b = await checkRateLimits(opts('req_f_2__12345678','2')); expect(b.blocked).toBeFalsy();
    const c = await checkRateLimits(opts('req_f_3__12345678','3')); expect(c.blocked).toBeFalsy();
    expect(await usageCount(uid)).toBe(3);
    const d = await checkRateLimits(opts('req_f_4__12345678','4'));
    expect(d.blocked).toBe(true); expect(d.code).toBe('quota_exceeded');
    expect(await usageCount(uid)).toBe(3);
    // refund one restores capacity once
    await refundReservation({ uid, reservationId: 'req_f_2__12345678', success: false, error: { code: 'ai' } });
    expect(await usageCount(uid)).toBe(2);
    const e = await checkRateLimits(opts('req_f_5__12345678','5')); expect(e.blocked).toBeFalsy();
    expect(await usageCount(uid)).toBe(3);
    // concurrent at limit
    const race = await Promise.all(Array.from({ length: 5 }, (_, i) => checkRateLimits(opts(`req_r_${i}__12345678`,`r${i}`))));
    expect(race.filter(r => !r.blocked).length).toBe(0);
    expect(await usageCount(uid)).toBe(3);
  });

  maybe('9) generated recovery: no AI regen state; settle completes without decrement', async () => {
    const uid = 'u_generated'; const reqId = 'req_gen_12345678'; const p = payload();
    await checkRateLimits({ uid, plan: 'premium', clientRequestId: reqId, payload: p, dailyLimit: 10 });
    await markGenerated({ uid, reservationId: reqId, result: doneResult('g1'), sessionId: 'sess_1' });
    expect((await resState(uid, reqId)).state).toBe('generated');
    // settlement failure after generated must not refund/decrement
    await refundReservation({ uid, reservationId: reqId, success: false, error: { code: 'settle' } });
    expect(await usageCount(uid)).toBe(1);
    expect((await resState(uid, reqId)).state).toBe('generated');
    // recovery path sees generated
    const rec = await checkRateLimits({ uid, plan: 'premium', clientRequestId: reqId, payload: p, dailyLimit: 10 });
    expect(rec.recoverGenerated).toBe(true);
    expect((rec.replay?.done?.messageId || rec.replay?.messageId)).toBe('g1');
    // completing settlement commits
    await refundReservation({ uid, reservationId: reqId, success: true, result: doneResult('g1') });
    expect((await resState(uid, reqId)).state).toBe('committed');
    expect(await usageCount(uid)).toBe(1);
  });

  maybe('10) interruption during processing (reserved): active retry rejected as in-progress', async () => {
    const uid = 'u_interrupt'; const reqId = 'req_intr_12345678'; const p = payload();
    await checkRateLimits({ uid, plan: 'premium', clientRequestId: reqId, payload: p, dailyLimit: 10 });
    expect((await resState(uid, reqId)).state).toBe('reserved');
    const active = await checkRateLimits({ uid, plan: 'premium', clientRequestId: reqId, payload: p, dailyLimit: 10 });
    expect(active.blocked).toBe(true);
    expect(active.code).toBe('idempotency_conflict');
    expect(await usageCount(uid)).toBe(1);
  });
});
