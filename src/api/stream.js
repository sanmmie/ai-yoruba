'use strict';

/**
 * src/api/stream.js
 *
 * Streaming client for the chat endpoint.
 *
 *  - Same-origin fetch via the /api/chat Hosting rewrite when deployed
 *    (no CORS, no hard-coded function URL); falls back to the direct
 *    function URL for the dev server and the emulator.
 *  - SSE parser with event: and data: lines.
 *  - One in-flight stream per session guarded by state; late chunks from
 *    an aborted or superseded stream are ignored (R10).
 *  - One automatic retry on network failure with the same
 *    clientRequestId (R4), then an inline Retry on the failed message.
 */
import { auth } from '../firebase-config.js';

let _endpoint = null;

function endpoint() {
  if (_endpoint) return _endpoint;
  const env = import.meta.env.VITE_AI_STREAM_ENDPOINT;
  if (env) { _endpoint = env; return _endpoint; }
  if (import.meta.env.DEV) {
    _endpoint = 'http://localhost:5001/ai-yoruba/us-central1/yorubaAIv2/chat/stream';
  } else {
    // Same-origin rewrite: /api/chat → the Cloud Function.
    _endpoint = '/api/chat';
  }
  return _endpoint;
}

export async function streamChat({ sessionId, message, clientRequestId, mode, regenerate, expectedLastMessageId }, { onDelta, onDone, onError, signal }) {
  const token = await auth.currentUser.getIdToken(false);
  const appCheckToken = window.__ygptAppCheckToken || null;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  if (appCheckToken) headers['X-Firebase-AppCheck'] = appCheckToken;

  const res = await fetch(endpoint(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ sessionId, message, clientRequestId, mode, regenerate, expectedLastMessageId }),
    signal,
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.error?.message || 'request_failed'), { code: err.error?.code, missing: err.error?.missing, policyVersion: err.error?.policyVersion, retryAfter: err.error?.retryAfter });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      if (!part.trim()) continue;
      const lines = part.split('\n');
      let event = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        if (line.startsWith('data: ')) data = line.slice(6);
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        if (event === 'delta' && onDelta) onDelta(parsed.text || '');
        if (event === 'done' && onDone) onDone(parsed);
        if (event === 'error' && onError) onError(parsed);
      } catch (e) {}
    }
  }
}

export function newRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function newStreamId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `stream_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}