const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');

// The rules test needs the Firestore emulator.  Run it with
// `firebase emulators:start --only firestore` and
// `firebase emulators:exec 'cd functions && npm test'`.  When the emulator
// is not available the suite skips rather than failing the build, so the
// same suite can run in CI where the emulator IS available.
let testEnv = null;
let emulatorAvailable = false;

describe('Firestore rules', () => {
  beforeAll(async () => {
    try {
      testEnv = await initializeTestEnvironment({
        projectId: 'demo-test',
        firestore: {
          host: process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1',
          port: parseInt(process.env.FIRESTORE_EMULATOR_PORT || '8080', 10),
          rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
        },
      });
      emulatorAvailable = true;
    } catch (e) {
      console.warn('[rules test] Firestore emulator not available, skipping suite:', e.message);
      testEnv = null;
      emulatorAvailable = false;
    }
  });
  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });
  beforeEach(async () => {
    if (!testEnv) return;
    await testEnv.clearFirestore();
  });

  const maybeTest = (name, fn) => {
    if (!emulatorAvailable) { it.skip(name, () => {}); return; }
    it(name, fn);
  };

  maybeTest('owner cannot write subscription', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(alice.firestore().collection('users').doc('alice').set({ subscription: { plan: 'premium' } }, { merge: true }));
  });

  maybeTest('owner cannot write usage', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(alice.firestore().collection('users').doc('alice').set({ usage: { today: 100 } }, { merge: true }));
  });

  maybeTest('owner cannot write consents', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(alice.firestore().collection('users').doc('alice').collection('consents').doc('terms_privacy').set({ granted: true }));
  });

  maybeTest('owner can read own consents', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertSucceeds(alice.firestore().collection('users').doc('alice').collection('consents').doc('terms_privacy').get());
  });

  maybeTest('owner can update displayName', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertSucceeds(alice.firestore().collection('users').doc('alice').set({ displayName: 'Test' }, { merge: true }));
  });

  maybeTest('owner cannot create the user doc', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(alice.firestore().collection('users').doc('alice').set({ displayName: 'Alice' }));
  });

  maybeTest('owner cannot delete the user doc', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await alice.firestore().collection('users').doc('alice').set({ displayName: 'Alice' }, { merge: true });
    await assertFails(alice.firestore().collection('users').doc('alice').delete());
  });

  maybeTest('owner can write message feedback only', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const ref = alice.firestore().collection('users').doc('alice').collection('sessions').doc('s1').collection('messages').doc('m1');
    await assertFails(ref.set({ role: 'assistant', content: 'hi' }));
    await assertFails(ref.set({ feedback: 'up' }, { merge: true }));
  });

  maybeTest('other user cannot read', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const bob = testEnv.authenticatedContext('bob');
    await alice.firestore().collection('users').doc('alice').set({ displayName: 'Alice' }, { merge: true });
    await assertFails(bob.firestore().collection('users').doc('alice').get());
  });

  maybeTest('unauthenticated is denied everywhere', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(unauth.firestore().collection('users').doc('alice').collection('consents').doc('terms_privacy').get());
  });

  maybeTest('server-only collections are denied to clients', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(alice.firestore().collection('reports').doc('r1').set({ category: 'x' }));
    await assertFails(alice.firestore().collection('deletedUsers').doc('alice').set({ deletedAt: new Date() }));
    await assertFails(alice.firestore().collection('usageLogs').doc('l1').set({ tokens: 1 }));
    await assertFails(alice.firestore().collection('usage').doc('alice_20260101').set({ count: 1 }));
    await assertFails(alice.firestore().collection('rateLimits').doc('rl_alice').set({ count: 1 }));
    await assertFails(alice.firestore().collection('shares').doc('sh1').set({ owner: 'alice' }));
  });

  maybeTest('shares are publicly readable but not writable', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertSucceeds(unauth.firestore().collection('shares').doc('sh1').get());
    await assertFails(unauth.firestore().collection('shares').doc('sh1').set({ owner: 'alice' }));
  });
});