'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { authorize, settle, markGenerated, ERR } = require('../middleware/authz');
const { log } = require('../utils/adminLogger');
const { SYSTEM_PROMPT } = require('../prompts/system');
const { plans } = require('../config/plans');

const allowedOrigins = [
  'https://ai-yoruba.web.app',
  'https://ai-yoruba.firebaseapp.com',
  process.env.APP_URL,
].filter(Boolean);

const app = express();
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: process.env.MAX_JSON_BYTES || '64kb' }));

app.post('/chat/stream', handleChatStream);
app.post('/chat', handleChatStream);
app.post('/api/chat', handleChatStream);
app.post('/api/chat/stream', handleChatStream);
app.post('/', handleChatStream);
app.post('', handleChatStream);

function isAbortLike(err) {
  if (!err) return false;
  if (err.name === 'AbortError' || err.name === 'APIUserAbortError') return true;
  const msg = String(err.message || '');
  return /aborted|abort/i.test(msg) && !/stream failed/i.test(msg);
}

async function handleChatStream(req, res) {
  const body = req.body || {};
  const clientRequestId = typeof body.clientRequestId === 'string' ? body.clientRequestId.trim() : '';
  const requestId = clientRequestId || `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const streamId = `stream_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  let auth = null;
  let headersSent = false;
  let settled = false;
  let settledSuccess = null;
  let anthropicStream = null;
  let completed = false;
  let terminalEmitted = false;
  let cancelled = false;
  let cancelReason = null;
  const abortController = new AbortController();
  const listeners = [];

  const track = (target, event, fn) => { target.on(event, fn); listeners.push([target, event, fn]); };
  const cleanup = () => {
    for (const [target, event, fn] of listeners) {
      try { if (target.off) target.off(event, fn); else if (target.removeListener) target.removeListener(event, fn); } catch {}
    }
    listeners.length = 0;
  };

  async function settleOnce(success, result, error) {
    if (settled) return settledSuccess;
    settled = true;
    settledSuccess = !!success;
    if (!auth) return settledSuccess;
    try { await settle(auth, { success: !!success, requestId: auth.reservationId || requestId, result, error }); } catch (e) {
      log.error('settle failed', e, { uid: auth.uid, requestId, success: !!success });
    }
    return settledSuccess;
  }

  function abortUpstream(reason) {
    if (cancelled) return;
    cancelled = true;
    cancelReason = reason || cancelReason || 'cancelled';
    try { abortController.abort(); } catch {}
    try { if (anthropicStream && typeof anthropicStream.abort === 'function') anthropicStream.abort(); } catch {}
  }

  function openSSE() {
    if (headersSent) return;
    headersSent = true;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-YGPT-Request-Id', requestId);
    res.write(': ping\n\n');
  }

  function endStream(event, data) {
    if (terminalEmitted) return;
    terminalEmitted = true;
    if (event === 'done') completed = true;
    if (!headersSent) openSSE();
    if (res.writableEnded) return;
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
    try { res.end(); } catch {}
  }

  function sendSSEError(code, message, extra = {}) {
    if (terminalEmitted) return;
    if (!headersSent) {
      const status = code === 'unauthenticated' ? 401
        : code === 'consent_required' || code === 'permission_denied' ? 403
        : code === 'idempotency_conflict' || code === 'idempotency_payload_mismatch' ? 409
        : code === 'rate_limited' || code === 'quota_exceeded' ? 429
        : code === 'invalid_argument' ? 400
        : 500;
      terminalEmitted = true;
      return res.status(status).json({ error: { code, message, ...extra } });
    }
    return endStream('error', { code, message, ...extra });
  }

  track(req, 'close', () => {
    if (completed || terminalEmitted) return;
    log.info('client disconnected', { requestId, uid: auth?.uid, streamId });
    abortUpstream('client_disconnect');
  });

  try {
    const { sessionId, message, mode: _mode, regenerate: _regenerate, expectedLastMessageId: _expected } = body;
    if (typeof message !== 'string' || !message.trim()) {
      return sendSSEError('invalid_argument', ERR.invalid_argument.message);
    }
    const MAX_INPUT_CHARS = parseInt(process.env.MAX_INPUT_CHARS || '8000', 10);
    if (message.length > MAX_INPUT_CHARS) {
      return sendSSEError('invalid_argument', ERR.invalid_argument.message);
    }
    if (sessionId && !/^sess_[A-Za-z0-9_]+$/.test(sessionId)) {
      return sendSSEError('invalid_argument', ERR.invalid_argument.message);
    }

    openSSE();

    auth = await authorize(req, { sessionId, requestId: clientRequestId || requestId, streamId, payload: { sessionId: sessionId || null, message: message.trim(), mode: _mode || null, regenerate: !!_regenerate } });
    const { uid, plan } = auth;

    // Idempotent replay / generated recovery: do not re-run provider when result is durably known.
    if (auth.idempotentReplay) {
      if (auth.idempotentReplay.error) {
        const e = auth.idempotentReplay.error;
        return sendSSEError(e.code || 'internal', e.message || 'Internal error.', e.extra || {});
      }
      const donePayload = auth.idempotentReplay.done || { messageId: auth.idempotentReplay.messageId || '', remaining: auth.quota?.remaining ?? null, limit: auth.quota?.limit ?? null };
      // generated => persisted but settlement pending: safely complete settlement without AI regeneration.
      if (auth.recoverGenerated) {
        await settleOnce(true, { messageId: donePayload.messageId, done: donePayload });
        log.info('chat/stream recovered generated response', { uid, requestId: auth.reservationId || requestId });
      } else {
        await settleOnce(true); // committed replay: settlement already final/no-op
        log.info('chat/stream idempotent replay', { uid, requestId: auth.reservationId || requestId });
      }
      return endStream('done', donePayload);
    }

    const db = admin.firestore();
    let history = [];
    if (sessionId) {
      try {
        const msgSnap = await db.collection('users').doc(uid).collection('sessions').doc(sessionId).collection('messages')
          .orderBy('seq', 'asc')
          .get();
        history = msgSnap.docs.map(d => ({ role: d.data().role, content: d.data().content }));
      } catch (e) {
        history = [];
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      await settleOnce(false);
      return sendSSEError('config', 'AI service is not configured.');
    }

    const cfg = plans[plan] || plans.free;
    const anthropic = new Anthropic({ apiKey });
    const maxTokens = cfg.maxOutputTokens;

    let fullText = '';
    try {
      anthropicStream = anthropic.messages.stream({
        model: cfg.model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [...history, { role: 'user', content: message.trim() }],
      }, { signal: abortController.signal });

      anthropicStream.on('text', (text) => {
        if (cancelled || completed || terminalEmitted || res.writableEnded) return;
        fullText += text;
        try { res.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`); } catch {}
      });
      anthropicStream.on('error', (e) => { if (!cancelled) log.error('anthropic stream error event', e, { uid, requestId }); });

      if (cancelled) abortUpstream(cancelReason);
      await anthropicStream.finalMessage();

      if (cancelled) {
        await settleOnce(false);
        // Do not emit done/error for client-initiated disconnect; just end.
        if (!terminalEmitted && !res.writableEnded) try { res.end(); } catch {}
        return;
      }

      let messageId = auth.reservationId ? `${auth.reservationId}__assistant` : '';
      if (sessionId) {
        const sidRef = db.collection('users').doc(uid).collection('sessions').doc(sessionId);
        const userMsgId = auth.reservationId ? `${auth.reservationId}__user` : sidRef.collection('messages').doc().id;
        const asstMsgId = auth.reservationId ? `${auth.reservationId}__assistant` : sidRef.collection('messages').doc().id;
        await db.runTransaction(async (tx) => {
          const sidSnap = await tx.get(sidRef);
          const seq = (sidSnap.exists ? (sidSnap.data().seq ?? 0) : 0) + 1;
          const midUser = sidRef.collection('messages').doc(userMsgId);
          const midAsst = sidRef.collection('messages').doc(asstMsgId);
          const expireAt = admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
          tx.set(midUser, {
            role: 'user', content: message.trim(), seq, createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expireAt, model: cfg.model, clientRequestId: auth.reservationId || requestId,
          }, { merge: true });
          tx.set(midAsst, {
            role: 'assistant', content: fullText, seq, createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expireAt, model: cfg.model, clientRequestId: auth.reservationId || requestId,
          }, { merge: true });
          tx.set(sidRef, {
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            seq,
            messageCount: admin.firestore.FieldValue.increment(2),
          }, { merge: true });
          messageId = midAsst.id;
        });
      }

      if (cancelled) { await settleOnce(false); if (!res.writableEnded) try { res.end(); } catch {} return; }
      const donePayload = { messageId, remaining: auth.quota?.remaining ?? null, limit: auth.quota?.limit ?? null };
      // Durable state: response persisted. Mark generated before final settlement so recovery can complete without AI regen.
      try { await markGenerated(auth, { result: { messageId, done: donePayload }, sessionId: sessionId || null }); } catch (e) { log.error('markGenerated failed', e, { uid, requestId, messageId }); }
      await settleOnce(true, { messageId, done: donePayload });
      log.info('chat/stream completed', { uid, requestId, messageId, plan });
      return endStream('done', donePayload);
    } catch (err) {
      const aborted = cancelled || isAbortLike(err) || anthropicStream?.aborted;
      if (aborted && cancelReason === 'client_disconnect') {
        await settleOnce(false);
        if (!terminalEmitted && !res.writableEnded) try { res.end(); } catch {}
        return;
      }
      log.error('Anthropic stream failed', err, { uid, requestId, cancelled, reason: cancelReason });
      await settleOnce(false, null, { code: aborted ? 'stream_aborted' : 'ai', message: aborted ? 'Stream was interrupted.' : 'error' });
      return sendSSEError(aborted ? 'stream_aborted' : 'ai', aborted ? 'Stream was interrupted.' : 'error');
    }
  } catch (e) {
    await settleOnce(false);
    log.error('chat/stream error', e, { requestId, uid: auth?.uid });
    const code = e?.code || 'internal';
    const message = e?.message || 'Internal error.';
    return sendSSEError(code, message, e.extra || {});
  } finally {
    cleanup();
  }
}

exports.yorubaAIv2 = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB', minInstances: 1, maxInstances: 20, secrets: ['ANTHROPIC_API_KEY'] })
  .https.onRequest(app);

exports._test = { isAbortLike };
