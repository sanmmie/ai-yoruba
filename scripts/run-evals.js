// scripts/run-evals.js
const fs = require('fs');
const path = require('path');

async function run() {
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, '../evals/yoruba_eval.jsonl'), 'utf8'));
  const results = [];
  for (const c of cases) {
    results.push({ id: c.id, category: c.category, status: 'needs_review', must_include: c.must_include, must_not_include: c.must_not_include });
  }
  const outDir = path.join(__dirname, '../evals/results');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify({ results }, null, 2));
  console.log('wrote', out);
}

run().catch(e => { console.error(e); process.exit(1); });
