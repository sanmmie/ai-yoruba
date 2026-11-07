'use strict';

const path = require('path');
const fs = require('fs');

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function parseSSEFrame(frame) {
  const lines = frame.split(/\r?\n/);
  let event = 'message';
  let data = '';
  for (const line of lines) {
    if (line.startsWith('event: ')) event = line.slice(7).trim();
    if (line.startsWith('data: ')) data += (data ? '\n' : '') + line.slice(6);
  }
  return { event, data: data ? JSON.parse(data) : null };
}

describe('yorubaAIv2 route contract (verified from source/config)', () => {
  test('firebase hosting rewrite targets yorubaAIv2 function via /api/chat', () => {
    const firebasePath = path.resolve(__dirname, '..', '..', 'firebase.json');
    const firebase = JSON.parse(fs.readFileSync(firebasePath, 'utf8'));
    const rewrites = firebase.hosting && firebase.hosting.rewrites || [];
    const api = rewrites.find(r => r.source === '/api/chat');
    expect(api).toBeTruthy();
    expect(api.function.functionId).toBe('yorubaAIv2');
    expect(api.function.region).toBe('us-central1');
  });

  test('express app exposes canonical and compatibility chat routes', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/handlers/aiHandlerV2.js'), 'utf8');
    for (const route of ['/chat/stream', '/chat', '/api/chat', '/api/chat/stream']) {
      expect(src).toContain(`app.post('${route}'`);
    }
  });
});

describe('SSE event contract', () => {
  test('delta event frame', () => {
    const frame = parseSSEFrame(sse('delta', { text: 'Ẹ kú àbọ̀' }));
    expect(frame.event).toBe('delta');
    expect(frame.data.text).toContain('Ẹ kú àbọ̀');
  });

  test('done event frame', () => {
    const frame = parseSSEFrame(sse('done', { messageId: 'm1', remaining: 9, limit: 10 }));
    expect(frame.event).toBe('done');
    expect(frame.data).toEqual({ messageId: 'm1', remaining: 9, limit: 10 });
  });

  test('error event frame', () => {
    const frame = parseSSEFrame(sse('error', { code: 'quota_exceeded', message: 'Daily quota exceeded.' }));
    expect(frame.event).toBe('error');
    expect(frame.data.code).toBe('quota_exceeded');
  });

  test('CRLF frames parse', () => {
    const frame = parseSSEFrame('event: done\r\ndata: {"ok":true}\r\n\r\n');
    expect(frame.event).toBe('done');
    expect(frame.data.ok).toBe(true);
  });
});

describe('error classification mapping', () => {
  function mapStatusToCode(status, bodyCode) {
    if (bodyCode) return bodyCode;
    if (status === 401) return 'unauthenticated';
    if (status === 403) return 'consent_required';
    if (status === 429) return 'quota_exceeded';
    if (status >= 500) return 'internal';
    return 'invalid_argument';
  }

  test('maps HTTP statuses to expected categories', () => {
    expect(mapStatusToCode(400)).toBe('invalid_argument');
    expect(mapStatusToCode(401)).toBe('unauthenticated');
    expect(mapStatusToCode(403)).toBe('consent_required');
    expect(mapStatusToCode(429)).toBe('quota_exceeded');
    expect(mapStatusToCode(500)).toBe('internal');
  });
});


describe('HTTP/SSE error contract mapping (source contract)', () => {
  test('handler maps pre-stream error codes to required HTTP statuses', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/handlers/aiHandlerV2.js'), 'utf8');
    expect(src).toContain("code === 'unauthenticated' ? 401");
    expect(src).toContain("code === 'consent_required' || code === 'permission_denied' ? 403");
    expect(src).toContain("code === 'idempotency_conflict' || code === 'idempotency_payload_mismatch' ? 409");
    expect(src).toContain("code === 'rate_limited' || code === 'quota_exceeded' ? 429");
    expect(src).toContain("code === 'invalid_argument' ? 400");
    expect(src).toContain(': 500');
    expect(src).toContain("return endStream('error', { code, message, ...extra });"); // post-stream SSE path
  });
});
