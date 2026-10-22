const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');

describe('Firestore rules', () => {
  let testEnv;
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-test',
      firestore: {
        rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      },
    });
  });
  afterAll(async () => {
    await testEnv.cleanup();
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it('owner cannot write subscription', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(alice.firestore().collection('users').doc('alice').set({ subscription: { plan: 'premium' } }, { merge: true }));
  });

  it('owner cannot write usage', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(alice.firestore().collection('users').doc('alice').set({ usage: { today: 100 } }, { merge: true }));
  });

  it('owner can update displayName', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertSucceeds(alice.firestore().collection('users').doc('alice').set({ displayName: 'Test' }, { merge: true }));
  });

  it('other user cannot read', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const bob = testEnv.authenticatedContext('bob');
    await alice.firestore().collection('users').doc('alice').set({ displayName: 'Alice' }, { merge: true });
    await assertFails(bob.firestore().collection('users').doc('alice').get());
  });

  it('create is false', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(alice.firestore().collection('users').doc('alice').set({ displayName: 'Alice' }));
  });
});
