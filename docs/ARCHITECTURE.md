# ARCHITECTURE.md

## Data Model

- users/{uid}: profile, subscription, usage
- users/{uid}/sessions/{sid}: session metadata
- users/{uid}/sessions/{sid}/messages/{mid}: messages
- stripeEvents/{id}, flwEvents/{id}: webhook idempotency

## Request Flow

1. Client authenticates via Firebase Auth
2. Client calls streaming endpoint with ID token
3. Server verifies token, checks rate limit and quota
4. Server streams from Anthropic
5. Server persists messages and returns done event

## Quota Flow

- Free: daily limit in Africa/Lagos timezone, transactional reservation with refund on failure
- Premium: checked by plan and period end with grace period

## Payment Flow

- Stripe/Flutterwave checkout created via callable
- Webhooks verify signatures, deduplicate, update subscription
