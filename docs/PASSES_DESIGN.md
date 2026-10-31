# PASSES_DESIGN.md

Design only — do not implement without approval.

## Test tier
- Price range: ₦2,000–₦5,000 (VERIFY with the user).
- Duration: daily and weekly passes.
- Payment: bank transfer or USSD.
- Daily cap: between free (10) and premium (300).

## Mechanism
- A `passes` collection: users/{uid}/passes/{passId} with type, expiresAt, dailyCap.
- The gate reads the best active pass when the free quota is exhausted.
- Passes do not stack; the highest cap wins for the day.

## Open questions
- Does a pass upgrade the model to the premium tier? VERIFY.
- Is a pass compatible with a premium subscription? VERIFY.