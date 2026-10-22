const admin = require('firebase-admin');

async function migrateSessions() {
  if (admin.apps.length === 0) admin.initializeApp();
  const dryRun = process.env.DRY_RUN !== 'false';
  console.log(dryRun ? 'DRY RUN' : 'LIVE RUN');
  const db = admin.firestore();
  const users = await db.collection('users').get();
  for (const userDoc of users.docs) {
    const uid = userDoc.id;
    const sessions = await db.collection('users').doc(uid).collection('sessions').get();
    for (const s of sessions.docs) {
      const data = s.data();
      if (Array.isArray(data.history) && data.history.length > 0) {
        console.log(`Would migrate ${uid}/${s.id} with ${data.history.length} messages`);
        if (!dryRun) {
          const batch = db.batch();
          for (const m of data.history) {
            const ref = s.ref.collection('messages').doc();
            batch.set(ref, { role: m.role, content: m.content, createdAt: m.timestamp ? admin.firestore.Timestamp.fromDate(new Date(m.timestamp)) : admin.firestore.FieldValue.serverTimestamp() });
          }
          batch.update(s.ref, { history: admin.firestore.FieldValue.delete() });
          await batch.commit();
        }
      }
    }
  }
}

migrateSessions().catch(e => { console.error(e); process.exit(1); });
