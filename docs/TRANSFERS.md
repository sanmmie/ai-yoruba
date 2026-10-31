# TRANSFERS.md — Cross-border transfer register (NDPA s.40 equivalent)

DRAFT — for review by a Nigerian-qualified lawyer.  Generated from the
vendor list in package.json and the CSP connect-src list; a CI check
fails if a vendor is missing from this table.

| # | Vendor | Data categories | Destination region | Purpose | Transfer safeguard | Documented at | Status |
|---|---|---|---|---|---|---|---|
| 1 | Firebase Hosting | None hosted (static assets only) | us-central1 (nam5 for Firestore) | Frontend delivery | Adequacy / standard terms | firebase.json | VERIFIED |
| 2 | Firebase Auth (Google) | Name, email, profile picture, Google account id | Google servers | Authentication | Standard contractual clauses / Google DPA | docs/VENDOR_TERMS_REVIEW.md | PENDING |
| 3 | Firestore | All personal data in ROPA.md | nam5 (current location — do not migrate without asking) | Storage | Firebase DPA / SCCs | firebase.json | PENDING |
| 4 | Cloud Functions | All personal data processed in memory | us-central1 | Backend processing | Firebase DPA / SCCs | firebase.json | PENDING |
| 5 | App Check / reCAPTCHA | App token, device fingerprint | Google servers | Abuse protection | Standard terms | docs/VENDOR_TERMS_REVIEW.md | PENDING |
| 6 | Analytics (GA4 or PostHog) | Aggregate events, no content | Vendor region | Product analytics (consented only) | DPA / SCCs | docs/ANALYTICS.md | PENDING |
| 7 | Anthropic (Claude) | User messages and assistant replies | us/eu | Model inference | Vendor DPA, zero-retention availability to VERIFY | docs/VENDOR_TERMS_REVIEW.md | PENDING |
| 8 | Stripe | Email, customer metadata, subscription id | us/ie | Payments | SCCs / Stripe DPA | docs/VENDOR_TERMS_REVIEW.md | PENDING |
| 9 | Flutterwave | Email, customer metadata, subscription id | ng/uk | Payments | Contractual terms to VERIFY | docs/VENDOR_TERMS_REVIEW.md | PENDING |
| 10 | Sentry (if enabled) | Error stacks, PII-scrubbed context | Vendor region | Error monitoring | DPA / SCCs, PII scrubbing required | docs/VENDOR_TERMS_REVIEW.md | PENDING |
| 11 | Transactional email (if enabled) | Email address | Vendor region | Service communications | DPA / SCCs | docs/VENDOR_TERMS_REVIEW.md | PENDING |

## Current regions
- Firestore: `nam5` (recorded in firebase.json). Do not migrate without approval.
- Functions: `us-central1`. Latency from Nigeria measured in Phase 3; a move to europe-west1 would be recorded here.

## CI consistency check
`scripts/check-transfers.js` reads package.json dependencies and the CSP
connect-src list in firebase.json, and fails if any vendor is not present in
this table.