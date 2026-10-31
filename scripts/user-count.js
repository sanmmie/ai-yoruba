#!/usr/bin/env node
/**
 * scripts/user-count.js
 *
 * Reports the distinct user count per rolling six months from Firestore
 * (aggregate count only).  Used to watch for the NDPC "major importance"
 * threshold of 200 data subjects in six months.  Dry-run by default.
 */
const admin = require('firebase-admin');
if (admin.apps.length === 0) admin.initializeApp();

async function main() {
  const db = admin.firestore();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const snap = await db.collection('users').get();
  let count = 0;
  snap.forEach(doc => {
    const d = doc.data();
    const created = d.createdAt ? d.createdAt.toDate() : null;
    if (!created || created >= sixMonthsAgo) count++;
  });
  console.log(JSON.stringify({
    totalUsers: snap.size,
    usersInLastSixMonths: count,
    threshold200: count >= 200,
    threshold1000: count >= 1000,
    threshold5000: count >= 5000,
    windowStart: sixMonthsAgo.toISOString(),
  }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });