'use strict';

/**
 * functions/test/idempotencyQuota.test.js
 * D2/D1-adjacent logic tests (pure, no Firestore emulator required).
 */

const { stablePayloadHash, isValidClientRequestId, requestDocId, CLIENT_REQUEST_ID_RE } = require('../src/middleware/rateLimit');
const { isAbortLike } = require('../src/handlers/aiHandlerV2')._test;

describe('D2 clientRequestId validation and payload binding', () => {
  test('accepts valid IDs and rejects invalid/too short/too long', () => {
    expect(isValidClientRequestId('req_12345678')).toBe(true);
    expect(isValidClientRequestId('abc:def-ghi_123456')).toBe(true);
    expect(isValidClientRequestId('short')).toBe(false);
    expect(isValidClientRequestId('a'.repeat(129))).toBe(false);
    expect(isValidClientRequestId('bad id with spaces!!!!')).toBe(false);
    expect(CLIENT_REQUEST_ID_RE.test('req_12345678')).toBe(true);
  });

  test('payload hash is stable and binds key request fields', () => {
    const a = stablePayloadHash({ sessionId: 'sess_1', message: 'Bawo ni?', mode: 'chat', regenerate: false });
    const b = stablePayloadHash({ sessionId: 'sess_1', message: 'Bawo ni?', mode: 'chat', regenerate: false, ignored: 'x' });
    const c = stablePayloadHash({ sessionId: 'sess_1', message: 'Different', mode: 'chat', regenerate: false });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  test('same ID with different payload produces conflict signal by hash mismatch (contract)', () => {
    const h1 = stablePayloadHash({ sessionId: 's', message: 'one' });
    const h2 = stablePayloadHash({ sessionId: 's', message: 'two' });
    expect(h1 === h2).toBe(false);
  });

  test('reservation doc IDs are user-scoped', () => {
    expect(requestDocId('userA', 'req_same')).toBe('userA__req_same');
    expect(requestDocId('userB', 'req_same')).not.toBe(requestDocId('userA', 'req_same'));
  });
});

describe('D1 abort classification (exactly-once/cancel safety helpers)', () => {
  test('recognizes abort-like errors', () => {
    expect(isAbortLike({ name: 'AbortError' })).toBe(true);
    expect(isAbortLike({ name: 'APIUserAbortError' })).toBe(true);
    expect(isAbortLike(new Error('request aborted'))).toBe(true);
    expect(isAbortLike(new Error('stream failed'))).toBe(false);
    expect(isAbortLike(null)).toBe(false);
  });
});
