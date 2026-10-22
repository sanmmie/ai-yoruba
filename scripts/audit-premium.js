const admin = require('firebase-admin');

async function auditPremium() {
  if (admin.apps.length === 0) admin.initializeApp();
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

auditPremium().catch(e => { console.error(e); process.exit(1); });
