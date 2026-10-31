'use strict';
const admin = require('firebase-admin');
if (admin.apps.length === 0) admin.initializeApp();

exports.yorubaAI              = require('./handlers/aiHandler').yorubaAI;
exports.yorubaAIv2            = require('./handlers/aiHandlerV2').yorubaAIv2;
exports.createCheckoutSession = require('./handlers/paymentHandler').createCheckoutSession;
exports.stripeWebhook         = require('./handlers/webhookStripe').stripeWebhook;
exports.flutterwaveWebhook    = require('./handlers/webhookFlutterwave').flutterwaveWebhook;
exports.cleanupUserData       = require('./handlers/cleanup').cleanupUserData;

// Phase 1: consent, deletion, export, reporting
exports.consentFunctions       = require('./handlers/consent').consentFunctions;
exports.deletionFunctions      = require('./handlers/deletion').deletionFunctions;
exports.exportFunctions        = require('./handlers/export').exportFunctions;
exports.reportFunctions        = require('./handlers/report').reportFunctions;

const functions = require('firebase-functions');
const { getFirestore } = require('firebase-admin/firestore');

exports.downgradeExpiredPremium = functions
  .runWith({ timeoutSeconds: 540 })
  .pubsub.schedule('every 24 hours')
  .onRun(async () => {
    const db = getFirestore();
    const now = admin.firestore.Timestamp.now();
    const graceDays = parseInt(process.env.GRACE_DAYS ?? '3', 10);
    const graceMs = graceDays * 24 * 60 * 60 * 1000;
    const cutoff = admin.firestore.Timestamp.fromMillis(now.toMillis() - graceMs);
    const snap = await db.collection('users')
      .where('subscription.plan', '==', 'premium')
      .where('subscription.currentPeriodEnd', '<=', cutoff)
      .get();
    const batch = db.batch();
    snap.docs.forEach(doc => {
      batch.update(doc.ref, {
        'subscription.plan': 'free',
        'subscription.status': 'expired',
        'subscription.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    if (!snap.empty) await batch.commit();
    return null;
  });

exports.expireSessions = functions
  .runWith({ timeoutSeconds: 540 })
  .pubsub.schedule('every 6 hours')
  .onRun(async () => {
    const db = getFirestore();
    const now = admin.firestore.Timestamp.now();
    const snap = await db.collectionGroup('sessions')
      .where('expireAt', '<=', now)
      .get();
    if (snap.empty) return null;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return null;
  });