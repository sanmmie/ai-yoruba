# SETUP RUNBOOK (DRAFT - needs credentials)
- APIs: Cloud Functions, Cloud Run, Artifact Registry, Secret Manager, App Check, reCAPTCHA Enterprise
- Secrets: ANTHROPIC_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, FLW_SECRET_KEY, FLW_WEBHOOK_HASH
- Params/env: limits, models, APP_URL=https://ai-yoruba.web.app, POLICY_VERSION, retention
- Auth: WIF or least-privilege SA key
- Domains: ai-yoruba.web.app, ai-yoruba.firebaseapp.com, preview channels
- Webhooks: register at new function URLs
- Firestore backup/PITR per RETENTION.md
- DPA terms with vendors in TRANSFERS.md
