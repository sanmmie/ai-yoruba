#!/usr/bin/env node
/**
 * scripts/stream-probe.js
 *
 * Records first-chunk and last-chunk timestamps on a preview channel so the
 * /api/chat Hosting rewrite can be validated against the 60-second rewrite
 * limit and the CDN buffering behaviour.
 *
 * Requires a test ID token.  Run with:
 *   FIREBASE_TEST_UID=<uid> node scripts/stream-probe.js <preview-url>
 */
const admin = require('firebase-admin');
if (admin.apps.length === 0) admin.initializeApp();

async function main() {
  const url = process.argv[2] || process.env.PREVIEW_URL;
  if (!url) { console.error('usage: node scripts/stream-probe.js <preview-url>'); process.exit(2); }
  const uid = process.env.FIREBASE_TEST_UID;
  if (!uid) { console.error('FIREBASE_TEST_UID required'); process.exit(2); }

  const token = await admin.auth().createCustomToken(uid);
  const res = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ sessionId: 'probe', message: 'Say hello in Yoruba.', clientRequestId: 'probe_' + Date.now() }),
  });
  if (!res.ok) { console.error('probe failed', res.status, await res.text()); process.exit(1); }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let firstChunkAt = null;
  let lastChunkAt = null;
  let eventCount = 0;
  const start = Date.now();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const now = Date.now();
    if (!firstChunkAt) firstChunkAt = now;
    lastChunkAt = now;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      if (part.trim()) eventCount++;
    }
  }
  const result = {
    url,
    firstChunkMs: firstChunkAt ? firstChunkAt - start : null,
    lastChunkMs: lastChunkAt ? lastChunkAt - start : null,
    totalMs: Date.now() - start,
    eventCount,
    ok: eventCount > 0,
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });