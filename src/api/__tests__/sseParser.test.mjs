import test from 'node:test';
import assert from 'node:assert/strict';
import { createSSEParser, parseSSE } from '../sseParser.js';

test('parses simple delta and done events', () => {
  const events = parseSSE('event: delta\ndata: {"text":"Ẹ"}\n\nevent: done\ndata: {"messageId":"m1"}\n\n');
  assert.deepEqual(events.map(e => e.event), ['delta', 'done']);
  assert.equal(JSON.parse(events[0].data).text, 'Ẹ');
});

test('supports CRLF and LF line endings', () => {
  const events = parseSSE('event: delta\r\ndata: {"text":"a"}\r\n\r\nevent: done\ndata: {"messageId":"x"}\n\n');
  assert.deepEqual(events.map(e => e.event), ['delta', 'done']);
});

test('handles fragmented chunks across frame boundaries', () => {
  const got = [];
  const p = createSSEParser({ onEvent: e => got.push(e) });
  p.feed('event: del');
  p.feed('ta\ndata: {"tex');
  p.feed('t":"káàbọ̀"}\n\n');
  p.feed('event: done\ndata: {"messageId":"m"}\n\n');
  p.flush();
  assert.equal(got.length, 2);
  assert.equal(JSON.parse(got[0].data).text, 'káàbọ̀');
});

test('supports multiple data lines joined by newline', () => {
  const events = parseSSE('event: delta\ndata: {"text":"a"}\ndata: {"text":"b"}\n\n');
  assert.equal(events.length, 1);
  assert.equal(events[0].data, '{"text":"a"}\n{"text":"b"}');
});

test('ignores comments/heartbeats', () => {
  const events = parseSSE(': ping\n\n: keepalive\nevent: done\ndata: {"ok":true}\n\n');
  assert.deepEqual(events.map(e => e.event), ['done']);
});

test('flush processes final buffered frame without trailing separator', () => {
  const got = [];
  const p = createSSEParser({ onEvent: e => got.push(e) });
  p.feed('event: done\ndata: {"messageId":"z"}');
  p.flush();
  assert.equal(got.length, 1);
  assert.equal(JSON.parse(got[0].data).messageId, 'z');
});

test('dispatch propagates callback exceptions (not swallowed)', () => {
  const p = createSSEParser({ onEvent: () => { throw new Error('boom'); } });
  assert.throws(() => p.feed('event: delta\ndata: {"text":"x"}\n\n'), /boom/);
});

test('preserves Yoruba diacritics in data payloads', () => {
  const text = 'Ẹ kú àbọ̀! Àṣà ìtumọ̀ ọ̀rọ̀ Yorùbá ń dára.';
  const events = parseSSE(`event: delta\ndata: ${JSON.stringify({ text })}\n\nevent: done\ndata: {"ok":true}\n\n`);
  assert.equal(JSON.parse(events[0].data).text, text);
});
