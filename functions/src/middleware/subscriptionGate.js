'use strict';

/**
 * functions/src/middleware/subscriptionGate.js
 *
 * Server-side premium check and free-quota enforcement.
 *
 * The user doc is created by an Auth onCreate trigger with a create-if-
 * absent transaction (R7).  This gate never creates documents and falls
 * back to the same transaction when a document is missing.  No merge-set
 * creation happens anywhere.
 *
 * Premium needs plan == 'premium' AND status in (active, trialing) AND
 * currentPeriodEnd > now - GRACE_DAYS.  The gate re-reads inside the
 * reservation transaction so a renewal racing the downgrade job cannot
 * race a chat request (R6).
 */
const admin = require('firebase-admin');
const { plans } = require('../config/plans');
const { reserve, commit, refund } = require('./quota');

const db = () => admin.firestore();

const GRACE_DAYS = parseInt(process.env.GRACE_DAYS ?? '3', 10);

function getLagosDateString() {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

async function getPlan(uid) {
  const snap = await db().collection('users').doc(uid).get();
  if (!snap.exists) return { plan: 'free', sub: {} };
  const sub = snap.data().subscription ?? {};
  const plan = sub.plan === 'premium' ? 'premium' : 'free';
  return { plan, sub };
}

async function isPremiumActive(uid) {
  const { sub } = await getPlan(uid);
  if (sub.plan !== 'premium') return false;
  if (sub.status !== 'active' && sub.status !== 'trialing') return false;
  if (!sub.currentPeriodEnd) return true;
  const endMs = sub.currentPeriodEnd.toMillis ? sub.currentPeriodEnd.toMillis() : new Date(sub.currentPeriodEnd).getTime();
  const graceMs = GRACE_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() > endMs + graceMs) {
    // Expired — downgrade inside a transaction (R6 re-read).
    await db().runTransaction(async (tx) => {
      const ref = db().collection('users').doc(uid);
      const s = await tx.get(ref);
      if (!s.exists) return;
      const cur = s.data().subscription ?? {};
      if (cur.plan !== 'premium') return;
      tx.update(ref, {
        'subscription.plan': 'free',
        'subscription.status': 'expired',
        'subscription.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    return false;
  }
  return true;
}

async function checkQuota(uid, requestId) {
  // Re-read the user doc inside the reservation transaction so a renewal
  // racing the downgrade job cannot race a chat request (R6).
  const userRef = db().collection('users').doc(uid);
  const planResult = await db().runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const sub = snap.exists ? (snap.data().subscription ?? {}) : {};
    if (sub.plan === 'premium' && (sub.status === 'active' || sub.status === 'trialing')) {
      const endMs = sub.currentPeriodEnd
        ? (sub.currentPeriodEnd.toMillis ? sub.currentPeriodEnd.toMillis() : new Date(sub.currentPeriodEnd).getTime())
        : Infinity;
      const graceMs = GRACE_DAYS * 24 * 60 * 60 * 1000;
      if (Date.now() <= endMs + graceMs) {
        return { plan: 'premium', limit: plans.premium.dailyMessageCap };
      }
      tx.update(userRef, {
        'subscription.plan': 'free',
        'subscription.status': 'expired',
        'subscription.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    return { plan: 'free', limit: plans.free.dailyMessageCap };
  });

  const res = await reserve(uid, planResult.limit, requestId);
  return {
    allowed: res.ok,
    plan: planResult.plan,
    remaining: res.remaining,
    limit: planResult.limit,
    alreadyCharged: res.alreadyCharged,
    requestId,
    reason: res.reason,
  };
}

async function commitQuota(requestId) {
  try { await commit(requestId); } catch (e) { console.error('[Quota] commit failed', e.message); }
}

async function refundQuota(requestId) {
  try { await refund(requestId); } catch (e) { console.error('[Quota] refund failed', e.message); }
}

module.exports = {
  getLagosDateString, getPlan, isPremiumActive, checkQuota, commitQuota, refundQuota, GRACE_DAYS,
};
