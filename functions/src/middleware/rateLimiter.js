'use strict';
<<<<<<< HEAD
/**
 * functions/src/middleware/rateLimiter.js
 * Per-UID burst limiter: 20 req/min (free) | 60 req/min (premium)
 * Primary: Upstash Redis (set UPSTASH_REDIS_URL + UPSTASH_REDIS_TOKEN)
 * Fallback: in-memory Map (sufficient for single-instance / low traffic)
 */
const WINDOW_MS = 60_000;
const LIMITS    = { free: 20, premium: 60 };
const _mem      = new Map();

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS * 2;
  for (const [k, v] of _mem) if (v.windowStart < cutoff) _mem.delete(k);
}, WINDOW_MS * 5).unref?.();

let _redis = null;
function getRedis() {
  if (_redis !== null) return _redis;
  const { UPSTASH_REDIS_URL: url, UPSTASH_REDIS_TOKEN: token } = process.env;
  if (!url || !token) return (_redis = false);
  try { const { Redis } = require('@upstash/redis'); _redis = new Redis({ url, token }); return _redis; }
  catch { console.warn('[RateLimiter] @upstash/redis not installed — using in-memory'); return (_redis = false); }
}

async function checkRateLimit(uid, plan = 'free') {
  const limit = LIMITS[plan] ?? LIMITS.free;
  const redis  = getRedis();
  return redis ? checkRedis(redis, `rl:${uid}`, limit) : checkMem(`rl:${uid}`, limit);
}

async function checkRedis(redis, key, limit) {
  const now = Date.now(), win = now - WINDOW_MS;
  try {
    const pipe = redis.pipeline();
    pipe.zremrangebyscore(key, 0, win);
    pipe.zcard(key);
    pipe.zadd(key, { score: now, member: `${now}-${Math.random()}` });
    pipe.expire(key, Math.ceil(WINDOW_MS / 1000) + 1);
    const res = await pipe.exec(), count = res[1] + 1;
    if (count > limit) { await redis.zremrangebyscore(key, now, now); return { allowed:false, remaining:0, resetInMs:WINDOW_MS }; }
    return { allowed:true, remaining:limit - count, resetInMs:WINDOW_MS };
  } catch (err) { console.error('[RateLimiter] Redis error — failing open:', err.message); return { allowed:true, remaining:limit, resetInMs:WINDOW_MS }; }
}

function checkMem(key, limit) {
  const now = Date.now(), entry = _mem.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) { _mem.set(key, { count:1, windowStart:now }); return { allowed:true, remaining:limit-1, resetInMs:WINDOW_MS }; }
  entry.count++;
  if (entry.count > limit) return { allowed:false, remaining:0, resetInMs:WINDOW_MS - (now - entry.windowStart) };
  return { allowed:true, remaining:limit - entry.count, resetInMs:WINDOW_MS - (now - entry.windowStart) };
}

module.exports = { checkRateLimit };
=======

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
>>>>>>> fix/master-upgrade-v2
