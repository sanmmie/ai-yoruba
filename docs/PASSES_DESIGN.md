# PASSES_DESIGN.md

## Daily/Weekly Passes (Design Only - Not Implemented)

### Overview
Support one-off passes for Flutterwave (design only).

### Pass Types
- Daily Pass: 24hr access, limited messages
- Weekly Pass: 7 day access

### Implementation Notes
- Store in `passes/{passId}` with uid, type, expiresAt, messagesRemaining
- Gate checks passes before free quota
- Flutterwave webhook would create pass on successful payment
- UI shows pass purchase option when limit hit
