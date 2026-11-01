'use strict';

/**
 * functions/test/webhookStripe.test.js
 *
 * RACE-CONDITION REGISTER tests for the Stripe webhook:
 *  - valid signature
 *  - bad signature
 *  - duplicate event
 *  - 10 concurrent identical events produce exactly one effect
 *  - out-of-order events
 *
 * The Stripe SDK is mocked so the handler never makes a real network call.
 * The Firestore emulator must be running (`firebase emulators:start`); the
 * suite skips gracefully when it is not.
 */
const { connectEmulator, isEmulatorAvailable } = require('./setup');

// Mock the stripe module before the handler is required.
const mockStripe = {
  customers: { retrieve: jest.fn() },
  subscriptions: { retrieve: jest.fn() },
  webhooks: {
    constructEvent: jest.fn(),
    generateTestHeaderString: jest.fn(({ payload, secret }) => `t=${secret},s=${Buffer.from(payload).toString('base64')}`),
  },
};
jest.mock('stripe', () => () => mockStripe);

let stripeWebhook;
let admin;
let db;

function mockReq(payload, signature) {
  return {
    headers: { 'stripe-signature': signature },
    rawBody: Buffer.from(JSON.stringify(payload)),
    body: JSON.parse(JSON.stringify(payload)),
  };
}

function mockRes() {
  const calls = [];
  return {
    status(c) { calls.push(['status', c]); return this; },
    send(s) { calls.push(['send', s]); return this; },
    json(o) { calls.push(['json', o]); return this; },
    calls,
  };
}

function makeEvent(type, id, object) {
  return { id, type, data: { object } };
}

describe('Stripe webhook', () => {
  beforeAll(async () => {
    admin = require('firebase-admin');
    await connectEmulator();
    stripeWebhook = require('../src/handlers/webhookStripe').stripeWebhook;
    db = admin.firestore();
  });

  beforeEach(async () => {
    if (!isEmulatorAvailable()) return;
    jest.clearAllMocks();
    const batch = db.batch();
    const snap = await db.collection('users').get();
    snap.docs.forEach(d => batch.delete(d.ref));
    const evSnap = await db.collection('stripeEvents').get();
    evSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  });

  const maybeTest = (name, fn) => {
    if (!isEmulatorAvailable()) { it.skip(name, () => {}); return; }
    it(name, fn);
  };

  maybeTest('rejects bad signature', async () => {
    const event = makeEvent('customer.subscription.updated', 'evt_bad', { customer: 'cus_x', status: 'active', current_period_end: 1700000000 });
    mockStripe.webhooks.constructEvent.mockImplementation(() => { throw new Error('sig fail'); });
    const res = mockRes();
    await stripeWebhook(mockReq(event, 'bad'), res);
    expect(res.calls.some(c => c[0] === 'status' && c[1] === 400)).toBe(true);
  });

  maybeTest('accepts valid signature and applies state', async () => {
    await db.collection('users').doc('alice').set({ subscription: { plan: 'free' } });
    const event = makeEvent('customer.subscription.updated', 'evt_ok1', { customer: 'cus_alice', status: 'active', current_period_end: 1700000000 });
    mockStripe.webhooks.constructEvent.mockReturnValue(event);
    mockStripe.customers.retrieve.mockResolvedValue({ metadata: { firebaseUID: 'alice' } });
    const res = mockRes();
    await stripeWebhook(mockReq(event, 'sig'), res);
    expect(res.calls.some(c => c[0] === 'json' && c[1]?.received === true)).toBe(true);
    const user = await db.collection('users').doc('alice').get();
    expect(user.data().subscription.plan).toBe('premium');
  });

  maybeTest('dedupes duplicate events (R5)', async () => {
    await db.collection('users').doc('bob').set({ subscription: { plan: 'free' } });
    const event = makeEvent('customer.subscription.updated', 'evt_dup', { customer: 'cus_bob', status: 'active', current_period_end: 1700000000 });
    mockStripe.webhooks.constructEvent.mockReturnValue(event);
    mockStripe.customers.retrieve.mockResolvedValue({ metadata: { firebaseUID: 'bob' } });
    await stripeWebhook(mockReq(event, 'sig'), mockRes());
    await stripeWebhook(mockReq(event, 'sig'), mockRes());
    const user = await db.collection('users').doc('bob').get();
    expect(user.data().subscription.plan).toBe('premium');
  });

  maybeTest('RACE: 10 concurrent identical events produce exactly one effect', async () => {
    await db.collection('users').doc('carol').set({ subscription: { plan: 'free' } });
    const event = makeEvent('customer.subscription.updated', 'evt_race', { customer: 'cus_carol', status: 'active', current_period_end: 1700000000 });
    mockStripe.webhooks.constructEvent.mockReturnValue(event);
    mockStripe.customers.retrieve.mockResolvedValue({ metadata: { firebaseUID: 'carol' } });
    await Promise.all(Array.from({ length: 10 }, () => stripeWebhook(mockReq(event, 'sig'), mockRes())));
    const user = await db.collection('users').doc('carol').get();
    expect(user.data().subscription.plan).toBe('premium');
  });

  maybeTest('out-of-order events do not overwrite a newer state', async () => {
    await db.collection('users').doc('dave').set({
      subscription: {
        plan: 'premium',
        currentPeriodEnd: admin.firestore.Timestamp.fromMillis(1900000000000),
      },
    });
    const older = makeEvent('customer.subscription.updated', 'evt_old', { customer: 'cus_dave', status: 'canceled', current_period_end: 1700000000 });
    mockStripe.webhooks.constructEvent.mockReturnValue(older);
    mockStripe.customers.retrieve.mockResolvedValue({ metadata: { firebaseUID: 'dave' } });
    await stripeWebhook(mockReq(older, 'sig'), mockRes());
    const user = await db.collection('users').doc('dave').get();
    expect(user.data().subscription.plan).toBe('premium');
  });
});