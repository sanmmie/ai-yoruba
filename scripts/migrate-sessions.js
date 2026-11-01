#!/usr/bin/env node
'use strict';
const admin = require('firebase-admin');
if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

async function run() {
  const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
  console.log('migrate-sessions', dryRun ? 'DRY-RUN' : 'APPLY');
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const sessionsSnap = await db.collection('users').doc(uid).collection('sessions').get();
    for (const s of sessionsSnap.docs) {
      const data = s.data() || {};
      if (Array.isArray(data.history) && data.history.length > 0) {
        console.log(would migrate / history entries: );
        if (!dryRun) {
          // conversion logic would go here
        }
      }
    }
  }
}
run().catch(e => { console.error(e); process.exit(1); });
