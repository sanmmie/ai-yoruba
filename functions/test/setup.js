'use strict';

/**
 * functions/test/setup.js
 *
 * Global Jest setup.  Connects the Admin SDK to the Firestore emulator
 * when one is available.  Tests that need the emulator skip gracefully
 * when it is not running, so the same suite can run locally (with
 * `firebase emulators:start`) and in CI (where the emulator IS available).
 */
const admin = require('firebase-admin');

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1';
const emulatorPort = parseInt(process.env.FIRESTORE_EMULATOR_PORT || '8080', 10);

let emulatorAvailable = false;

async function connectEmulator() {
  if (admin.apps.length === 0) admin.initializeApp({ projectId: 'demo-test' });
  try {
    await admin.firestore().settings({
      host: `${emulatorHost}:${emulatorPort}`,
      ssl: false,
    });
    await admin.firestore().collection('__probe__').limit(1).get();
    emulatorAvailable = true;
  } catch (e) {
    console.warn('[setup] Firestore emulator not available, skipping emulator-dependent tests:', e.message);
    emulatorAvailable = false;
  }
}

module.exports = connectEmulator;
module.exports.isEmulatorAvailable = () => emulatorAvailable;
module.exports.admin = admin;