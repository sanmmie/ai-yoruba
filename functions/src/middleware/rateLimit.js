'use strict';
const admin = require('firebase-admin');
const crypto = require('crypto');
const { plans } = require('../config/plans');

function getLagosDateKey() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const lagos = new Date(utc + (1 * 3600000));
  const y = lagos.getFullYear();
  const m = String(lagos.getMonth() + 1).padStart(2, '0');
  const d = String(lagos.getDate()).padStart(2, '0');
  return ${y};
}

function hashIp(ip) {
  if (!ip) return 'unknown';
  const salt = process.env.IP_SALT || 'ygpt';
  return crypto.createHash('sha256').update(salt + ip).digest('hex').slice(0, 16);
}

async function checkRateLimits({ uid, req, plan }) {
  const db = admin.firestore();
  const cfg = plans[plan] || plans.free;
  const dailyLimit = cfg.dailyLimit;
  const dateKey = getLagosDateKey();
  const usageRef = db.collection('usage').doc(${uid}_);
  const requestId = eq__;
  const reservationRef = db.collection('reservations').doc(requestId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const usageSnap = await tx.get(usageRef);
      const count = usageSnap.exists ? (usageSnap.data().count || 0) : 0;
      if (count >= dailyLimit) {
        return { blocked: true, code: 'quota_exceeded' };
      }
      tx.set(usageRef, { count: count + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      tx.set(reservationRef, { uid, requestId, state: 'reserved', createdAt: admin.firestore.FieldValue.serverTimestamp(), dateKey }, { merge: false });
      return { blocked: false, reservationId: requestId, quota: { remaining: Math.max(0, dailyLimit - (count + 1)), limit: dailyLimit } };
    });
    return result;
  } catch (e) {
    if (plan === 'premium') {
      return { blocked: false, reservationId: requestId, quota: { remaining: null, limit: plans.premium.dailyLimit } };
    }
    return { blocked: true, code: 'rate_limited' };
  }
}

async function refundReservation({ uid, reservationId, success }) {
  const db = admin.firestore();
  const reservationRef = db.collection('reservations').doc(reservationId);
  const dateKey = getLagosDateKey();
  const usageRef = db.collection('usage').doc(${uid}_);
  await db.runTransaction(async (tx) => {
    const rSnap = await tx.get(reservationRef);
    if (!rSnap.exists) return;
    const r = rSnap.data();
    if (r.state !== 'reserved') return;
    if (success) {
      tx.update(reservationRef, { state: 'committed', committedAt: admin.firestore.FieldValue.serverTimestamp() });
      return;
    }
    tx.update(reservationRef, { state: 'refunded', refundedAt: admin.firestore.FieldValue.serverTimestamp() });
    const uSnap = await tx.get(usageRef);
    if (uSnap.exists) {
      const count = uSnap.data().count || 0;
      tx.update(usageRef, { count: Math.max(0, count - 1), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
  });
}

module.exports = { checkRateLimits, refundReservation, getLagosDateKey, hashIp };
