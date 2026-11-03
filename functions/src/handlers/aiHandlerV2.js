'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { authorize, settle, ERR } = require('../middleware/authz');
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
app.use(express.json());

app.post('/chat/stream', handleChatStream);
app.post('/chat', handleChatStream);
app.post('/api/chat', handleChatStream);
app.post('/api/chat/stream', handleChatStream);
app.post('/', handleChatStream);
app.post('', handleChatStream);

async function handleChatStream(req, res) {
  const requestId = req.body?.clientRequestId || `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const streamId = `stream_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  let auth = null;
  try {
    const { sessionId, message, mode: _mode, regenerate: _regenerate, expectedLastMessageId: _expected } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: ERR.invalid_argument });
    }
    const MAX_INPUT_CHARS = parseInt(process.env.MAX_INPUT_CHARS || '8000', 10);
    if (message.length > MAX_INPUT_CHARS) {
      return res.status(400).json({ error: ERR.invalid_argument });
    }
    if (sessionId && !/^sess_[A-Za-z0-9_]+$/.test(sessionId)) {
      return res.status(400).json({ error: ERR.invalid_argument });
    }

    auth = await authorize(req, { sessionId, requestId, streamId });
    const { uid, plan } = auth;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.write(': ping\n\n');

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
      await settle(auth, { success: false, requestId });
      res.write(`event: error\ndata: ${JSON.stringify({ code: 'config', message: 'missing key' })}\n\n`);
      return res.end();
    }

    const cfg = plans[plan] || plans.free;
    const anthropic = new Anthropic({ apiKey });
    const maxTokens = cfg.maxOutputTokens;

    let fullText = '';
    let disconnected = false;
    req.on('close', () => { disconnected = true; });

    try {
      const stream = await anthropic.messages.stream({
        model: cfg.model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [...history, { role: 'user', content: message.trim() }],
      });

      stream.on('text', (text) => {
        if (disconnected) return;
        fullText += text;
        res.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`);
      });

      await stream.finalMessage();
      if (disconnected) {
        await settle(auth, { success: false, requestId });
        return res.end();
      }

      // Persist the message pair in one transaction with a monotonic seq
      // counter (R3) and expireAt per the retention policy (1.4).
      let messageId = '';
      if (sessionId) {
        const sidRef = db.collection('users').doc(uid).collection('sessions').doc(sessionId);
        await db.runTransaction(async (tx) => {
          const sidSnap = await tx.get(sidRef);
          const seq = (sidSnap.exists ? (sidSnap.data().seq ?? 0) : 0) + 1;
          const midUser = sidRef.collection('messages').doc();
          const midAsst = sidRef.collection('messages').doc();
          const expireAt = admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
          tx.set(midUser, {
            role: 'user', content: message.trim(), seq, createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expireAt, model: cfg.model, clientRequestId: requestId,
          });
          tx.set(midAsst, {
            role: 'assistant', content: fullText, seq, createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expireAt, model: cfg.model, clientRequestId: requestId,
          });
          tx.set(sidRef, {
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            seq,
            messageCount: admin.firestore.FieldValue.increment(2),
          }, { merge: true });
          messageId = midAsst.id;
        });
      }

exports.yorubaAIv2 = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB', minInstances: 1, maxInstances: 20, secrets: ['ANTHROPIC_API_KEY'] })
  .https.onRequest(app);

      await settle(auth, { success: true, requestId });
      res.write(`event: done\ndata: ${JSON.stringify({ messageId, remaining: auth.quota.remaining, limit: auth.quota.limit })}\n\n`);
      return res.end();
    } catch (err) {
      log.error('Anthropic stream failed', err, { uid });
      await settle(auth, { success: false, requestId });
      if (!res.headersSent) {
        return res.status(500).json({ error: ERR.internal });
      }
      res.write(`event: error\ndata: ${JSON.stringify({ code: 'ai', message: 'error' })}\n\n`);
      return res.end();
    }
  } catch (e) {
    if (auth) {
      try { await settle(auth, { success: false, requestId }); } catch {}
    }
    log.error('chat/stream error', e);
  }
}

exports.yorubaAIv2 = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB', minInstances: 1, maxInstances: 20, secrets: ['ANTHROPIC_API_KEY'] })
  .https.onRequest(app);
