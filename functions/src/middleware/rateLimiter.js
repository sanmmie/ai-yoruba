'use strict';

/**
 * functions/src/middleware/rateLimiter.js
 *
 * Layer B — burst limit.  Fixed-window counters in Firestore, incremented
 * inside a transaction so parallel requests cannot exceed the limit.
 *
 * Scopes: per UID (free 20/min, premium 60/min) and per IP (salted hash,
 * generous default 120/min because Nigerian mobile carriers share IPs).
 * Anonymous users get a tighter per-IP daily cap.  Counters carry a TTL
 * field for cleanup.  No limiter state may live only in instance memory.
 */
const admin = require('firebase-admin');
const crypto = require('crypto');

const db = () => admin.firestore();

const DEFAULT_LIMITS = {
  free: parseInt(process.env.BURST_LIMIT_FREE || '20', 10),
  premium: parseInt(process.env.BURST_LIMIT_PREMIUM || '60', 10),
  ip: parseInt(process.env.BURST_LIMIT_IP || '120', 10),
  anonIpDaily: parseInt(process.env.ANON_DAILY_CAP || '10', 10),
};

const WINDOW_MS = 60_000;
const SALT = process.env.IP_SALT || 'ygpt-salt';

function hashIp(ip) {
  if (!ip) return 'unknown';
  return crypto.createHash('sha256').update(SALT + ip).digest('hex').slice(0, 16);
}

function windowStart(nowMs = Date.now()) {
  return Math.floor(nowMs / WINDOW_MS) * WINDOW_MS;
}

async function increment(scope, key, limit, windowMs = WINDOW_MS) {
  const docKey = `${scope}_${key}_${windowStart()}`;
  const ref = db().collection('rateLimits').doc(docKey);
  const result = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    let count = 0;
    if (snap.exists) {
      const d = snap.data();
      if (d.windowStart === windowStart()) count = d.count ?? 0;
    }
    const newCount = count + 1;
    tx.set(ref, {
      scope, key, count: newCount, windowStart: windowStart(),
      ttl: now + windowMs * 2, updatedAt: now,
    }, { merge: true });
    return { count: newCount, limit };
  });
  return result;
}

async function checkBurst(uid, plan = 'free') {
  const limit = DEFAULT_LIMITS[plan] ?? DEFAULT_LIMITS.free;
  const { count } = await increment('uid', uid, limit);
  const allowed = count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - count),
    limit,
    retryAfter: allowed ? 0 : windowStart() + WINDOW_MS - Date.now(),
    scope: 'uid',
  };
}

async function checkIp(ip, { anonymous = false } = {}) {
  const key = hashIp(ip);
  const limit = anonymous ? DEFAULT_LIMITS.anonIpDaily : DEFAULT_LIMITS.ip;
  const windowMs = anonymous ? 24 * 60 * 60 * 1000 : WINDOW_MS;
  const { count } = await increment('ip', key, limit, windowMs);
  const allowed = count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - count),
    limit,
    retryAfter: allowed ? 0 : windowStart() + windowMs - Date.now(),
    scope: 'ip',
  };
}

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.connection?.remoteAddress
    || req.ip;
}

module.exports = { checkBurst, checkIp, clientIp, hashIp, DEFAULT_LIMITS };
