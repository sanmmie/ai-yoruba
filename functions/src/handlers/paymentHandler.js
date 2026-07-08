'use strict';
/**
 * functions/src/handlers/paymentHandler.js
 * createCheckoutSession — Firebase Callable Cloud Function
 *
 * Creates a hosted payment URL for Stripe or Flutterwave.
 * User is NEVER charged here — this only returns a redirect URL.
 * Actual charge + subscription activation happens via webhooks.
 *
 * Security:
 *  - Firebase Auth token verified automatically (onCall)
 *  - planId validated against server-side allowlist (never trust client price IDs)
 *  - User UID embedded in provider metadata for webhook correlation
 *  - No secret keys reach the client
 */
const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const Stripe    = require('stripe');
const axios     = require('axios');
const { log }   = require('../utils/adminLogger');

const BASE_URL = process.env.APP_BASE_URL ?? 'https://yorubagpt.netlify.app';

const PLAN_CONFIG = {
  premium: {
    stripe:      { priceId: process.env.STRIPE_PRICE_ID_PREMIUM },
    flutterwave: { planId: process.env.FLW_PLAN_ID, amount: 15000, currency: 'NGN' },
  },
};

exports.createCheckoutSession = functions
  .runWith({ timeoutSeconds: 30, memory: '256MB', secrets: ['STRIPE_SECRET_KEY','FLW_SECRET_KEY','FLW_PUBLIC_KEY'] })
  .https.onCall(async (data, context) => {

    if (!context.auth)
      throw new functions.https.HttpsError('unauthenticated', 'Kò sí ìgbàláàyè.');

    const uid   = context.auth.uid;
    const email = context.auth.token.email ?? '';
    const { provider, planId } = data;

    if (!['stripe','flutterwave'].includes(provider))
      throw new functions.https.HttpsError('invalid-argument', 'Provider kò tọ́.');
    if (!PLAN_CONFIG[planId])
      throw new functions.https.HttpsError('invalid-argument', 'Ìpele kò tọ́.');

    const planCfg  = PLAN_CONFIG[planId];
    const userSnap = await admin.firestore().collection('users').doc(uid).get();
    const sub      = userSnap.exists ? (userSnap.data().subscription ?? {}) : {};

    try {
      const url = provider === 'stripe'
        ? await createStripeSession({ uid, email, planCfg, sub, planId })
        : await createFlutterwaveLink({ uid, email, planCfg });
      log.info('Checkout session created', { uid, provider, planId });
      return { url };
    } catch (err) {
      log.error('Checkout creation failed', err, { uid, provider });
      throw new functions.https.HttpsError('internal', 'Kò lè ṣẹ̀dá ìsanwó. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.');
    }
  });

async function createStripeSession({ uid, email, planCfg, sub, planId }) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  let customerId = sub.stripeCustomerId;
  if (!customerId) {
    const c = await stripe.customers.create({ email, metadata: { firebaseUID: uid } });
    customerId = c.id;
  }
  const session = await stripe.checkout.sessions.create({
    customer:              customerId,
    mode:                  'subscription',
    line_items:            [{ price: planCfg.stripe.priceId, quantity: 1 }],
    success_url:           `${BASE_URL}/index.html?payment=success&provider=stripe`,
    cancel_url:            `${BASE_URL}/pricing.html?payment=cancel`,
    client_reference_id:   uid,
    allow_promotion_codes: true,
    subscription_data:     { metadata: { firebaseUID: uid, planId } },
  });
  return session.url;
}

async function createFlutterwaveLink({ uid, email, planCfg }) {
  const res = await axios.post('https://api.flutterwave.com/v3/payments', {
    tx_ref:       `ygpt_${uid}_${Date.now()}`,
    amount:       planCfg.flutterwave.amount,
    currency:     planCfg.flutterwave.currency,
    payment_plan: planCfg.flutterwave.planId,
    redirect_url: `${BASE_URL}/index.html?payment=success&provider=flutterwave`,
    customer:     { email, name: email.split('@')[0] },
    customizations: { title:'YorùbáGPT Premium', description:'Ìwọ́siwájú sí ìpele Premium', logo:`${BASE_URL}/icon-192.png` },
    meta:         { firebaseUID: uid, planId: 'premium' },
  }, { headers: { Authorization:`Bearer ${process.env.FLW_SECRET_KEY}`, 'Content-Type':'application/json' } });

  if (res.data.status !== 'success') throw new Error(`Flutterwave: ${res.data.message}`);
  return res.data.data.link;
}
