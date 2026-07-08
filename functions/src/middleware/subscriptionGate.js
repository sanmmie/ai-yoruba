'use strict';
/**
 * functions/src/middleware/subscriptionGate.js
 *
 * SECURITY — THE REAL ENFORCEMENT LAYER.
 * Client-side counters are UX hints only. This runs inside the Cloud Function
 * after Firebase verifies the ID token, before any AI call.
 *
 * Defence-in-depth:
 *   Layer 1 → Firebase Auth token (automatic for onCall)
 *   Layer 2 → This function (subscription + daily quota)
 *   Layer 3 → Firestore Security Rules (blocks direct DB manipulation)
 */
const admin     = require('firebase-admin');
const FREE_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT ?? '10', 10);

async function verifyActiveSubscription(uid) {
  const ref = admin.firestore().collection('users').doc(uid);
  try {
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ createdAt: admin.firestore.FieldValue.serverTimestamp(), subscription: { plan:'free', status:'active' }, usage: { today:1, date:today() } }, { merge:true });
      return { allowed:true, plan:'free' };
    }
    const data = snap.data(), sub = data.subscription ?? {};
    if (sub.plan === 'premium' && sub.status === 'active') return { allowed:true, plan:'premium' };
    const usage = data.usage ?? {}, isToday = usage.date === today(), used = isToday ? (usage.today ?? 0) : 0;
    if (used >= FREE_LIMIT) return { allowed:false, plan:'free', reason:`Ìwọ̀n ìbéèrè ọfẹ̀ (${FREE_LIMIT}/ọjọ́) ti dé. Gba Premium láti tẹsiwaju.` };
    await ref.update({ 'usage.today': isToday ? admin.firestore.FieldValue.increment(1) : 1, 'usage.date': today() });
    return { allowed:true, plan:'free' };
  } catch (err) {
    console.error('[SubGate] Firestore error — failing open:', err.message);
    return { allowed:true, plan:'free' };
  }
}

const today = () => new Date().toISOString().slice(0,10);
module.exports = { verifyActiveSubscription };
