'use strict';

/**
 * src/api/stream.js
 *
 * Streaming client for the YorùbáGPT chat endpoint.
 *
 * Contract (verified):
 * - Production (Hosting rewrite): POST same-origin /api/chat -> yorubaAIv2 (us-central1)
 * - Dev direct function URL: /yorubaAIv2/chat/stream (emulator)
 * - Express aliases in yorubaAIv2 also accept /chat, /chat/stream, /api/chat, /api/chat/stream, /
 * - SSE events: delta {text}, done {messageId,remaining,limit}, error {code,message,...}
 * - Some failures are returned as JSON HTTP errors before streaming; after the stream
 *   is opened, errors may arrive as an SSE error event.
 */
import { auth } from '../firebase-config.js';
import { createSSEParser } from './sseParser.js';

let _endpoint = null;

function endpoint() {
  if (_endpoint) return _endpoint;
  const env = import.meta.env.VITE_AI_STREAM_ENDPOINT || import.meta.env.VITE_AI_ENDPOINT;
  if (env) { _endpoint = env; return _endpoint; }
  if (import.meta.env.DEV) {
    _endpoint = 'http://localhost:5001/ai-yoruba/us-central1/yorubaAIv2/chat/stream';
  } else {
    _endpoint = '/api/chat';
  }
  return _endpoint;
}

function sseEventError(message, code = 'stream_error', extra = {}) {
  return Object.assign(new Error(message || 'stream_error'), { code, ...extra });
}

export { createSSEParser } from './sseParser.js';

export async function streamChat({ sessionId, message, clientRequestId, mode, regenerate, expectedLastMessageId }, { onDelta, onDone, onError, signal } = {}) {
  if (!auth?.currentUser) throw sseEventError('unauthenticated', 'unauthenticated');
  const token = await auth.currentUser.getIdToken(false);
  const appCheckToken = typeof window !== 'undefined' ? (window.__ygptAppCheckToken || null) : null;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Accept': 'text/event-stream, application/json',
  };
  if (appCheckToken) headers['X-Firebase-AppCheck'] = appCheckToken;

  let res;
  try {
    res = await fetch(endpoint(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionId, message, clientRequestId, mode, regenerate, expectedLastMessageId }),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw sseEventError(err?.message || 'network_error', err?.code || 'network_error');
  }

  const contentType = res.headers?.get?.('content-type') || '';
  if (!res.ok) {
    let errBody = {};
    if (contentType.includes('application/json')) errBody = await res.json().catch(() => ({}));
    else errBody = { error: { message: await res.text().catch(() => '') } };
    const e = errBody.error || errBody;
    throw sseEventError(e.message || 'request_failed', e.code || `http_${res.status}`, {
      status: res.status,
      missing: e.missing,
      policyVersion: e.policyVersion,
      retryAfter: e.retryAfter,
    });
  }

  if (!res.body || typeof res.body.getReader !== 'function') {
    if (contentType.includes('application/json')) {
      const body = await res.json().catch(() => ({}));
      const e = body.error || body;
      if (e && (e.code || e.message)) throw sseEventError(e.message || 'request_failed', e.code || 'request_failed', e);
    }
    throw sseEventError('stream_unavailable', 'stream_unavailable');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let doneReceived = false;
  let terminalError = null;

  const parser = createSSEParser({
    onEvent({ event, data }) {
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch (parseErr) {
        const e = sseEventError('Malformed SSE data', 'parse_error');
        e.cause = parseErr;
        throw e;
      }

      if (event === 'delta') {
        if (onDelta) onDelta(typeof parsed.text === 'string' ? parsed.text : '');
        return;
      }
      if (event === 'done') {
        if (doneReceived) return;
        doneReceived = true;
        if (onDone) onDone(parsed || {});
        return;
      }
      if (event === 'error') {
        terminalError = sseEventError(parsed?.message || 'stream_error', parsed?.code || 'stream_error', parsed || {});
        if (onError) onError(parsed || {});
        throw terminalError;
      }
    },
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
      if (terminalError) break;
      if (doneReceived) {
        try { await reader.cancel(); } catch {}
        break;
      }
    }
    parser.feed(decoder.decode());
    parser.flush();
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw err;
  } finally {
    try { reader.releaseLock(); } catch {}
  }

  if (terminalError) throw terminalError;
  if (!doneReceived) throw sseEventError('Stream ended before completion', 'incomplete_stream');
  return { ok: true };
}

export function newRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function newStreamId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `stream_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
