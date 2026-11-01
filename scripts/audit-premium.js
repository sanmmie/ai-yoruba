#!/usr/bin/env node
/**
 * scripts/audit-premium.js
 *
 * Lists users whose plan is 'premium' but who have no provider or
 * subscriptionId — i.e. self-granted or otherwise suspicious premium
 * status.  Admin SDK, dry-run by default.
 */
const admin = require('firebase-admin');
if (admin.apps.length === 0) admin.initializeApp();

async function main() {
  const db = admin.firestore();
  const dryRun = process.env.DRY_RUN !== 'false';
  console.log(dryRun ? 'DRY RUN - no changes' : 'LIVE RUN');
  const snap = await db.collection('users').get();
  const suspects = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const sub = data.subscription || {};
    if (sub.plan === 'premium') {
      if (!sub.subscriptionId && !sub.provider) {
        suspects.push({ uid: doc.id, subscription: sub });
      }
    }
  }
  console.log(JSON.stringify(suspects, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });