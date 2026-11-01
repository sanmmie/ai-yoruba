'use strict';
const admin = require('firebase-admin');
if (admin.apps.length === 0) admin.initializeApp();

const functions = require('firebase-functions');
const { getFirestore } = require('firebase-admin/firestore');

// AI handlers — keep both until Phase 5 removes the legacy path
exports.yorubaAI              = require('./handlers/aiHandler').yorubaAI;
exports.yorubaAIv2            = require('./handlers/aiHandlerV2').yorubaAIv2;

// Payments
exports.createCheckoutSession = require('./handlers/paymentHandler').createCheckoutSession;
exports.stripeWebhook         = require('./handlers/webhookStripe').stripeWebhook;
exports.flutterwaveWebhook    = require('./handlers/webhookFlutterwave').flutterwaveWebhook;

// Account lifecycle
exports.cleanupUserData       = require('./handlers/cleanup').cleanupUserData;
exports.consentFunctions      = require('./handlers/consent').consentFunctions;
exports.deletionFunctions     = require('./handlers/deletion').deletionFunctions;
exports.exportFunctions       = require('./handlers/export').exportFunctions;
exports.reportFunctions       = require('./handlers/report').reportFunctions;

// Scheduled jobs
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

// STT / TTS (Yoruba)
const textToSpeech = require('@google-cloud/text-to-speech');
const axios = require('axios');
const FormData = require('form-data');

const ttsClient = new textToSpeech.TextToSpeechClient();

exports.transcribeYorubaAudio = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).send('');
  }
  try {
    const { audioBase64 } = req.body;
    if (!audioBase64) return res.status(400).json({ error: 'No audio data received' });
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const formData = new FormData();
    formData.append('file', audioBuffer, { filename: 'speech.webm', contentType: 'audio/webm' });
    formData.append('model', 'whisper-1');
    formData.append('language', 'yo');
    formData.append('temperature', '0.1');
    const apiKey = process.env.OPENAI_API_KEY || (functions.config().openai && functions.config().openai.key);
    const whisperResponse = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: { ...formData.getHeaders(), Authorization: `Bearer ${apiKey}` },
    });
    return res.status(200).json({ text: whisperResponse.data.text });
  } catch (error) {
    console.error('STT Error:', error);
    return res.status(500).json({ error: 'Failed to transcribe Yoruba audio', details: error.message });
  }
});

exports.synthesizeYorubaVoice = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).send('');
  }
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'No text string provided' });
    const request = {
      input: { text },
      voice: { languageCode: 'yo-NG', name: 'yo-NG-Wavenet-A', ssmlGender: 'FEMALE' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95 },
    };
    const [response] = await ttsClient.synthesizeSpeech(request);
    return res.status(200).json({ audioContent: response.audioContent.toString('base64') });
  } catch (error) {
    console.error('TTS Error:', error);
    return res.status(500).json({ error: 'Failed to synthesize Yoruba speech' });
  }
});
