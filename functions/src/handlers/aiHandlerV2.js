'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { verifyActiveSubscription, refundQuota } = require('../middleware/subscriptionGate');
const { checkRateLimit } = require('../middleware/rateLimiter');
const { requireConsents } = require('../middleware/consentGate');
const { log } = require('../utils/adminLogger');
const { SYSTEM_PROMPT } = require('../prompts/system');

const allowedOrigins = [
  'https://ai-yoruba.web.app',
  'https://ai-yoruba.web.app',
  process.env.APP_BASE_URL
].filter(Boolean);

const app = express();
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

app.post('/chat/stream', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: { message: 'unauthenticated' } });
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch (e) {
      return res.status(401).json({ error: { message: 'unauthenticated' } });
    }
    const uid = decoded.uid;

    const { sessionId, message, mode: _mode, regenerate: _regenerate } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: { message: 'invalid-argument' } });
    }
    const MAX_INPUT_CHARS = parseInt(process.env.MAX_INPUT_CHARS || '8000', 10);
    if (message.length > MAX_INPUT_CHARS) {
      return res.status(400).json({ error: { message: 'invalid-argument' } });
    }
    if (sessionId && !/^sess_[A-Za-z0-9_]+$/.test(sessionId)) {
      return res.status(400).json({ error: { message: 'invalid-argument' } });
    }

const burst = await checkRateLimit(uid, 'free');
    if (!burst.allowed) {
      return res.status(429).json({ error: { message: 'rate-limited' } });
    }

    // NDPA: the account cannot chat until Terms + Privacy and the 18+
    // declaration are recorded and current against POLICY_VERSION.
    try {
      await requireConsents(uid);
    } catch (e) {
      if (e.code === 'consent_required') {
        return res.status(403).json({ error: { message: 'consent_required', missing: e.missing, policyVersion: e.policyVersion } });
      }
      throw e;
    }

    const quota = await verifyActiveSubscription(uid);
    if (!quota.allowed) {
      return res.status(402).json({ error: { message: quota.reason } });
    }

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
          .orderBy('createdAt', 'asc')
          .limit(100)
          .get();
        history = msgSnap.docs.map(d => ({ role: d.data().role, content: d.data().content }));
      } catch (e) {
        history = [];
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      await refundQuota(uid);
      res.write(`event: error\ndata: ${JSON.stringify({ code: 'config', message: 'missing key' })}\n\n`);
      return res.end();
    }

    const anthropic = new Anthropic({ apiKey });
    const modelFree = process.env.MODEL_FREE || 'claude-3-haiku-20240307';
    const modelPremium = process.env.MODEL_PREMIUM || 'claude-3-5-sonnet-20240620';
    const plan = quota.plan || 'free';
    const model = plan === 'premium' ? modelPremium : modelFree;
    const maxTokens = parseInt(process.env.MAX_TOKENS || '2048', 10);

    let fullText = '';
    let disconnected = false;
    req.on('close', () => { disconnected = true; });

    try {
      const stream = await anthropic.messages.stream({
        model,
        max_tokens: maxTokens,
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
        ],
        messages: [...history, { role: 'user', content: message.trim() }],
      });

stream.on('text', (text) => {
        if (disconnected) return;
        fullText += text;
        res.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`);
      });

      await stream.finalMessage();
      if (disconnected) {
        await refundQuota(uid);
        return res.end();
      }

      const batch = db.batch();
      if (sessionId) {
        const sidRef = db.collection('users').doc(uid).collection('sessions').doc(sessionId);
        const midUser = sidRef.collection('messages').doc();
        const midAsst = sidRef.collection('messages').doc();
        batch.set(midUser, { role: 'user', content: message.trim(), createdAt: admin.firestore.FieldValue.serverTimestamp(), model });
        batch.set(midAsst, { role: 'assistant', content: fullText, createdAt: admin.firestore.FieldValue.serverTimestamp(), model });
        batch.set(sidRef, { updatedAt: admin.firestore.FieldValue.serverTimestamp(), messageCount: admin.firestore.FieldValue.increment(2) }, { merge: true });
        await batch.commit();
      }

      res.write(`event: done\ndata: ${JSON.stringify({ messageId: Date.now().toString(), remaining: quota.remaining, limit: quota.limit })}\n\n`);
      return res.end();
    } catch (err) {
      log.error('Anthropic stream failed', err, { uid });
      await refundQuota(uid);
      if (!res.headersSent) {
        return res.status(500).json({ error: { message: 'internal' } });
      }
      res.write(`event: error\ndata: ${JSON.stringify({ code: 'ai', message: 'error' })}\n\n`);
      return res.end();
    }
  } catch (e) {
    log.error('chat/stream error', e);
    if (!res.headersSent) return res.status(500).json({ error: { message: 'internal' } });
    return res.end();
  }
});

exports.yorubaAIv2 = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB', secrets: ['ANTHROPIC_API_KEY'] })
  .https.onRequest(app);

