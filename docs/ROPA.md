# ROPA.md — Record of Processing Activities (NDPA s.28 equivalent)

DRAFT — for review by a Nigerian-qualified lawyer.

## Data inventory

| # | Collection / field | Data categories | Purpose | Lawful basis | Recipients | Retention | Status |
|---|---|---|---|---|---|---|---|
| 1 | users/{uid} | Name, email, photo, displayName, preferences | Account management | Contract | Firebase Auth, Firestore | Until deletion | CONFIRMED in code |
| 2 | users/{uid}/subscription | plan, status, provider, subscriptionId, currentPeriodEnd | Billing | Contract | Stripe, Flutterwave | Until deletion | CONFIRMED in code |
| 3 | users/{uid}/usage | count, date (Lagos day) | Quota enforcement | Legitimate interest | Server only | Until deletion | CONFIRMED in code |
| 4 | users/{uid}/sessions/{sid} | title, createdAt, updatedAt, expireAt, summary, messageCount, seq | Conversation history | Contract | Firestore | Per docs/RETENTION.md | CONFIRMED in code |
| 5 | users/{uid}/sessions/{sid}/messages/{mid} | role, content, createdAt, seq, expireAt, model, tokens, feedback | Conversation history | Contract | Firestore | Per docs/RETENTION.md | CONFIRMED in code |
| 6 | users/{uid}/consents/{type} | type, granted, policyVersion, locale, timestamps | Consent proof | Consent | Server only | Until deletion (VERIFY with counsel) | BUILT in Phase 1 |
| 7 | users/{uid}/reservations/{requestId} | state, count, clientRequestId | Quota reservation | Legitimate interest | Server only | Short-lived, reaped | BUILT in Phase 2 |
| 8 | users/{uid}/leases/{scope} | expiresAt, streamId | Concurrency control | Legitimate interest | Server only | Short-lived | BUILT in Phase 2 |
| 9 | rateLimits/{scope}_{key}_{window} | salted IP hash, count, TTL | Burst rate limiting | Legitimate interest | Server only | Short-lived | BUILT in Phase 2 |
| 10 | stripeEvents/{id}, flwEvents/{id} | event id, type, receivedAt | Payment idempotency | Legitimate interest | Server only | Until deletion | CONFIRMED in code |
| 11 | reports/{id} | reported message only, category, free text | Abuse handling | Legitimate interest | Server only | Until deletion | BUILT in Phase 1 |
| 12 | deletedUsers/{uid} | tombstone | Backup reconciliation | Legitimate interest | Server only | Until deletion | BUILT in Phase 1 |
| 13 | usageLogs | tokens, model, plan, cost, uid (hashed) | Cost reporting | Legitimate interest | Server only | Until deletion | BUILT in Phase 7 |
| 14 | shares/{shareId} | share id, revocation | Read-only sharing | Consent | Public (revocable) | Until revocation | BUILT in Phase 4 |

## Fields that must never exist
- Card numbers, CVV, PINs — never stored (Stripe/Flutterwave hosted checkouts only)
- Raw IP addresses — salted hash only
- Message content in logs, Sentry or analytics

## Open items for counsel
- Retention periods — VERIFY
- Whether consent proof must be retained after account deletion — VERIFY
- Whether usageLogs count as a separate processing activity