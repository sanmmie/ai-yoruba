const admin = require('firebase-admin');

async function costReport() {
  if (admin.apps.length === 0) admin.initializeApp();
  const db = admin.firestore();
  const snap = await db.collection('usageLogs').get();
  const byPlan = {};
  snap.docs.forEach(d => {
    const data = d.data();
    const plan = data.plan || 'free';
    if (!byPlan[plan]) byPlan[plan] = { count: 0, cost: 0 };
    byPlan[plan].count++;
    byPlan[plan].cost += Number(data.estimatedCost || 0);
  });
  console.log(JSON.stringify(byPlan, null, 2));
}

costReport().catch(e => { console.error(e); process.exit(1); });
