'use strict';

const admin = require('firebase-admin');

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ? process.env.FIRESTORE_EMULATOR_HOST.split(':')[0] : '127.0.0.1';
const emulatorPort = parseInt(process.env.FIRESTORE_EMULATOR_PORT || '8080', 10);

let emulatorAvailable = false;

function ensureApp() {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-test' });
  }
  return admin.app();
}

async function connectEmulator() {
  ensureApp();
  try {
    const db = admin.firestore();
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      db.settings({ host: `${emulatorHost}:${emulatorPort}`, ssl: false });
    }
    await db.collection('__probe__').limit(1).get();
    emulatorAvailable = true;
  } catch (e) {
    console.warn('[setup] Firestore emulator not available, skipping emulator-dependent tests:', e.message);
    emulatorAvailable = false;
  }
  return emulatorAvailable;
}

function isEmulatorAvailable() { return emulatorAvailable; }

module.exports = connectEmulator;
module.exports.connectEmulator = connectEmulator;
module.exports.ensureApp = ensureApp;
module.exports.isEmulatorAvailable = isEmulatorAvailable;
module.exports.admin = admin;
module.exports.emulatorHost = emulatorHost;
module.exports.emulatorPort = emulatorPort;
