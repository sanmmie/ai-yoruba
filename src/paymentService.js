/**
 * src/modules/paymentService.js
 *
 * Subscription state listener and checkout entry point.
 *
 * The listener is the single source of truth for the client: it reads
 * `subscription.plan` from Firestore and updates the UI.  The client never
 * trusts the redirect query string after a payment return — it waits for
 * this listener to flip the plan (R12).
 */
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '../firebase-config.js';
import { logger } from '../utils/logger.js';

let _unsub = null;
let _cb = null;

export function subscribeToSubscription(uid, cb) {
  _cb = cb;
  _unsub?.();
  _unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
    if (!snap.exists) return;
    const sub = snap.data().subscription ?? { plan: 'free' };
    const plan = sub.plan === 'premium' ? 'premium' : 'free';
    _cb?.({ plan, sub });
  }, (err) => logger.warn('Subscription listener error', err));
  return _unsub;
}

export function teardownSubscription() {
  _unsub?.(); _unsub = null; _cb = null;
}

export async function startCheckout(provider, planId) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const { functions } = await import('../firebase-config.js');
  const fn = httpsCallable(getFunctions(functions.app, 'us-central1'), 'createCheckoutSession');
  const r = await fn({ provider, planId });
  if (r.data?.url) {
    window.location.href = r.data.url;
    return;
  }
  throw new Error('No checkout URL returned');
}

export async function cancelSubscription() {
  // Self-service cancellation: the Stripe customer portal or the
  // Flutterwave subscription cancel call.  Implementation depends on
  // provider support — see docs/TAX_NOTES.md and task 1.7.
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const { functions } = await import('../firebase-config.js');
  const fn = httpsCallable(getFunctions(functions.app, 'us-central1'), 'cancelSubscription');
  const r = await fn({});
  return r.data;
}