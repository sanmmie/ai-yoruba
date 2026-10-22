'use strict';
/**
 * functions/src/middleware/subscriptionGate.js
 */
const admin     = require('firebase-admin');
const FREE_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT ?? '10', 10);
const GRACE_DAYS = parseInt(process.env.GRACE_DAYS ?? '3', 10);

function getLagosDateString() {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(new Date());
  } catch {
    return new Date().toISOString().slice(0,10);
  }
}

async function verifyActiveSubscription(uid) {
  const ref = admin.firestore().collection('users').doc(uid);
  const db = admin.firestore();
  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        tx.set(ref, { createdAt: admin.firestore.FieldValue.serverTimestamp(), subscription: { plan:'free', status:'active' }, usage: { count: 1, date: getLagosDateString() } }, { merge:true });
        return { allowed:true, plan:'free', remaining: FREE_LIMIT - 1, limit: FREE_LIMIT };
      }
      const data = snap.data(), sub = data.subscription ?? {};
      if (sub.plan === 'premium' && (sub.status === 'active' || sub.status === 'trialing')) {
        const periodEnd = sub.currentPeriodEnd;
        if (periodEnd) {
          const endMs = periodEnd.toMillis ? periodEnd.toMillis() : new Date(periodEnd).getTime();
          const graceMs = GRACE_DAYS * 24 * 60 * 60 * 1000;
          if (Date.now() > endMs + graceMs) {
            tx.update(ref, { 'subscription.plan': 'free', 'subscription.status': 'expired', 'subscription.updatedAt': admin.firestore.FieldValue.serverTimestamp() });
            // fall through to free logic
          } else {
            return { allowed:true, plan:'premium', remaining: null, limit: null };
          }
        } else {
          return { allowed:true, plan:'premium', remaining: null, limit: null };
        }
      }
      const usage = data.usage ?? {};
      const todayStr = getLagosDateString();
      const isToday = usage.date === todayStr;
      const used = isToday ? (usage.count ?? 0) : 0;
      if (used >= FREE_LIMIT) {
        return { allowed:false, plan:'free', reason:`Ìwọ̀n ìbéèrè ọfẹ̀ (${FREE_LIMIT}/ọjọ́) ti dé. Gba Premium láti tẹsiwaju.`, remaining: 0, limit: FREE_LIMIT };
      }
      tx.update(ref, { 'usage.count': isToday ? admin.firestore.FieldValue.increment(1) : 1, 'usage.date': todayStr });
      return { allowed:true, plan:'free', remaining: FREE_LIMIT - (used + 1), limit: FREE_LIMIT };
    });
    return result;
  } catch (err) {
    console.error('[SubGate] Firestore error:', err.message);
    // Fail closed for free users
    return { allowed:false, plan:'free', reason:'Ìṣòro ìsọfintí. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.', remaining: 0, limit: FREE_LIMIT };
  }
}

async function refundQuota(uid) {
  const ref = admin.firestore().collection('users').doc(uid);
  const db = admin.firestore();
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data();
      const sub = data.subscription ?? {};
      if (sub.plan === 'premium') return;
      const usage = data.usage ?? {};
      const todayStr = getLagosDateString();
      if (usage.date === todayStr && (usage.count ?? 0) > 0) {
        tx.update(ref, { 'usage.count': admin.firestore.FieldValue.increment(-1) });
      }
    });
  } catch (e) {
    console.error('[SubGate] refund failed', e.message);
  }
}

const today = () => getLagosDateString();
module.exports = { verifyActiveSubscription, refundQuota, getLagosDateString };
