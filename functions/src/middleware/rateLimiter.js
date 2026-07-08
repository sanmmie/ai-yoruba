'use strict';
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
