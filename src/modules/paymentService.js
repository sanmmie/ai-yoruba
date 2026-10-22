/**
 * src/modules/paymentService.js
 *
 * Client-side payment orchestration.
 * SECURITY: No secret keys here. Checkout sessions created server-side
 * (Cloud Function verifies Firebase ID token before touching any provider).
 * Firestore subscription.status is read here for DISPLAY ONLY — the real
 * enforcement gate is inside the Cloud Function.
 */

import { httpsCallable }           from 'firebase/functions';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { functions, db, auth }     from '../firebase-config.js';
import { logger }                  from '../utils/logger.js';

export const PLANS = {
  free:    { id:'free',    name:'Ọfẹ̀',     features:['10 ìbéèrè/ọjọ́','Ìbánisọ̀rọ̀ mẹ́ta','Àwọn ìlànà pàtàkì'] },
  premium: { id:'premium', name:'✦ Premium', priceUSD:9.99, priceNGN:15000,
    features:['Ìbéèrè àìlópin','Ìbánisọ̀rọ̀ tí kò lópin','Ìdáhùn yára jùlọ','Ìtọ́ka àṣà gígbòòrò','Àtìlẹ́yìn ààyò'] },
};

const _createCheckout = httpsCallable(functions, 'createCheckoutSession');

export async function startCheckout(provider, planId = 'premium') {
  if (!auth.currentUser) throw new Error('Jọ̀wọ́ wọlé kí o tó sanwó.');
  try {
    const { data } = await _createCheckout({ provider, planId });
    if (!data.url) throw new Error('Kò sí URL ìsanwó.');
    window.location.href = data.url;
  } catch (err) {
    logger.error('startCheckout failed', err, { provider, planId });
    throw err;
  }
}

export function subscribeToSubscription(uid, onStatus) {
  return onSnapshot(
    doc(db, 'users', uid),
    snap => {
      const sub = snap.exists() ? (snap.data().subscription ?? {}) : {};
      onStatus({ plan: sub.plan ?? 'free', status: sub.status ?? 'active', provider: sub.provider ?? null, currentPeriodEnd: sub.currentPeriodEnd ?? null });
    },
    err => { logger.error('subscribeToSubscription error', err, { uid }); onStatus({ plan:'free', status:'active', provider:null }); }
  );
}

export async function getSubscriptionOnce(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  const sub  = snap.exists() ? (snap.data().subscription ?? {}) : {};
  return { plan: sub.plan ?? 'free', status: sub.status ?? 'active' };
}
