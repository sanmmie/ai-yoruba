require('firebase-admin').initializeApp();
const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.yorubaAI              = require('./handlers/aiHandler').yorubaAI;
exports.yorubaAIv2            = require('./handlers/aiHandlerV2').yorubaAIv2;
exports.authFunctions        = require('./handlers/auth').authFunctions;
exports.consentFunctions     = require('./handlers/consent').consentFunctions;
exports.stripeWebhook        = require('./handlers/stripeWebhook').stripeWebhook;
exports.flwWebhook           = require('./handlers/flwWebhook').flwWebhook;
exports.deleteAccount        = require('./handlers/deleteAccount').deleteAccount;
exports.exportUserData       = require('./handlers/exportUserData').exportUserData;
exports.reportContent        = require('./handlers/reportContent').reportContent;
exports.purgeExpiredSessions = require('./handlers/retention').purgeExpiredSessions;

const db = admin.firestore();

exports.cleanupExpiredLeases = functions
  .region('us-central1')
  .pubsub.schedule('every 5 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const snap = await db.collection('leases').where('expiresAt', '<=', now).get();
    if (snap.empty) return null;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return null;
  });