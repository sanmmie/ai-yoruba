'use strict';

const admin = require('firebase-admin');
admin.initializeApp();

exports.yorubaAI = require('./handlers/aiHandler').yorubaAI;
exports.yorubaAIv2 = require('./handlers/aiHandlerV2').yorubaAIv2;

exports.consentFunctions = require('./handlers/consent').consentFunctions;
exports.deletionFunctions = require('./handlers/deletion').deletionFunctions;
exports.exportFunctions = require('./handlers/export').exportFunctions;
exports.reportFunctions = require('./handlers/report').reportFunctions;

exports.createCheckoutSession =
  require('./handlers/paymentHandler').createCheckoutSession;

exports.flutterwaveWebhook =
  require('./handlers/webhookFlutterwave').flutterwaveWebhook;

exports.stripeWebhook =
  require('./handlers/webhookStripe').stripeWebhook;

const cleanup = require('./handlers/cleanup');

exports.cleanupUserData = cleanup.cleanupUserData;
exports.runCleanupUserData = cleanup.runCleanupUserData;
