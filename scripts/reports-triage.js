#!/usr/bin/env node
/**
 * scripts/reports-triage.js
 *
 * Lists open abuse reports.  Server-only collection.
 */
const admin = require('firebase-admin');
if (admin.apps.length === 0) admin.initializeApp();

async function main() {
  const db = admin.firestore();
  const snap = await db.collection('reports').orderBy('createdAt', 'desc').get();
  const rows = [];
  snap.forEach(doc => {
    const d = doc.data();
    rows.push({
      id: doc.id,
      category: d.category,
      messageId: d.messageId,
      sessionId: d.sessionId,
      createdAt: d.createdAt ? d.createdAt.toDate().toISOString() : null,
      note: (d.note || '').slice(0, 120),
    });
  });
  console.log(JSON.stringify(rows, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });