# EVALS.md

## Yoruba Evaluation

### Running Evals
```bash
node scripts/run-evals.js
```

Results written to `evals/results/<timestamp>.json`

### Adding Cases
Add to `evals/yoruba_eval.jsonl` with format:
```json
{"id":"...","category":"...","prompt":"...","must_include":[],"must_not_include":[],"notes":"..."}
```

### Scoring
Rule-based checks for diacritics, required terms, forbidden terms. Cases needing human review are marked.
