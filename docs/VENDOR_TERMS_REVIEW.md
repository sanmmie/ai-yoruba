# VENDOR_TERMS_REVIEW.md

DRAFT — every row marked PENDING must be verified against the vendor's
current terms before the live channel is opened.  Do not promise a vendor
feature (zero retention, no training, SCCs) in the Privacy Notice until it
is recorded here as VERIFIED with a source link and review date.

## AI vendor — Anthropic (Claude)

| Item | Value | Source | Status |
|---|---|---|---|
| Permitted uses of API data | VERIFY | docs.anthropic.com | PENDING |
| API data used for training | VERIFY (opt-out availability) | docs.anthropic.com | PENDING |
| Zero-retention availability | VERIFY | docs.anthropic.com | PENDING |
| Retention period for API inputs | VERIFY | docs.anthropic.com | PENDING |
| Age rules | VERIFY | docs.anthropic.com | PENDING |
| Deletion on request | VERIFY | docs.anthropic.com | PENDING |
| Model IDs in use | claude-3-haiku-20240307, claude-3-5-sonnet-20240620 (to be replaced) | functions/src/config/plans.js | PENDING — verify current IDs and pricing |

## Firebase vendors

| Vendor | Permitted uses | Training | Retention | Deletion on request | Source | Status |
|---|---|---|---|---|---|---|
| Firebase Auth (Google) | Authentication only | N/A | Until account deletion | Supported via Admin SDK | firebase.google.com | PENDING |
| Firestore | Storage for the fields in ROPA.md | N/A | Configurable TTL / manual | Supported via Admin SDK | firebase.google.com | PENDING |
| Cloud Functions | Processing only | N/A | Ephemeral | N/A | firebase.google.com | PENDING |
| App Check / reCAPTCHA | Abuse protection | N/A | N/A | N/A | google.com | PENDING |

## Payment vendors

| Vendor | Permitted uses | Card data stored? | Deletion on request | Source | Status |
|---|---|---|---|---|---|
| Stripe | Billing, subscription lifecycle | No — hosted checkout only | Supported | stripe.com | PENDING |
| Flutterwave | Billing, subscription lifecycle | No — hosted checkout only | Supported | flutterwave.com | PENDING |

## Monitoring

| Vendor | Data received | PII scrubbing | Source | Status |
|---|---|---|---|---|
| Sentry (if enabled) | Error stacks and context | Required — UIDs truncated, emails masked, no message content | sentry.io | PENDING |

## Review cadence
Re-review each vendor annually or when its terms change, whichever comes first. Record the review date and reviewer here.