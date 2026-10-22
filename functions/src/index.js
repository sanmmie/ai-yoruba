'use strict';
const admin = require('firebase-admin');
if (admin.apps.length === 0) admin.initializeApp();

exports.yorubaAI              = require('./handlers/aiHandler').yorubaAI;
exports.createCheckoutSession = require('./handlers/paymentHandler').createCheckoutSession;
exports.stripeWebhook         = require('./handlers/webhookStripe').stripeWebhook;
exports.flutterwaveWebhook    = require('./handlers/webhookFlutterwave').flutterwaveWebhook;
