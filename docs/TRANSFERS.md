# TRANSFERS.md (DRAFT for counsel review)

| Vendor | Data categories | Destination region | Purpose | Transfer safeguard | Documented where | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Firebase Hosting/Functions/Firestore/Auth/App Check | Account, auth tokens, chat sessions/messages, usage | us-central1 / project region (TBD) | Platform | Google Data Processing Addendum / Firebase terms (VERIFY) | firebase.json, Google terms | PENDING |
| Anthropic | Messages/prompts (user content) | US (VERIFY region) | LLM inference | DPA / API terms (VERIFY zero-retention) | VENDOR_TERMS_REVIEW.md | PENDING |
| Stripe | Email, payment metadata (no card data stored) | US/Global (VERIFY) | Payments | Stripe DPA (VERIFY) | terms/checkout | PENDING |
| Flutterwave | Email, payment metadata, tx_ref | Nigeria/Global (VERIFY) | Payments (NGN) | Flutterwave terms/DPA (VERIFY) | terms/checkout | PENDING |
| Google (OAuth) | Profile data (name/email/photo) | US/Global (VERIFY) | Auth | Google terms (VERIFY) | auth flow | PENDING |
