# EVALS.md

## Usage
```bash
node scripts/run-evals.js --token <test-token> --endpoint <url>
```
Writes results to `evals/results/<timestamp>.json`.  Exits non-zero below a
threshold recorded in `scripts/run-evals.js`.

## Cases
`evals/yoruba_eval.jsonl` — 60 starter cases across greetings, grammar
correction, tone marks, owe, history, translation both ways, refusal and
safety, prompt injection, and sensitive-topic handling (health, religion,
minors).

## Provenance
Every case's provenance is recorded in docs/CONTENT_PROVENANCE.md.  Never
fabricate expected Yorùbá — mark cases for human review.

## Measurement
- Yorùbá versus English token-cost measurement is recorded in the results
  file.
- Threshold and pass rate are defined in scripts/run-evals.js.