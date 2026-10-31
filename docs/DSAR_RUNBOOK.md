# DSAR_RUNBOOK.md — Data Subject Access Requests

DRAFT.  VERIFY the statutory response times with a Nigerian-qualified
lawyer; do not state them from memory.

## How a request arrives
1. In-app "Download my data" in Settings → Privacy & data (calls
   `exportFunctions` → `exportUserData`).
2. Email to the DPO address published in the Privacy Notice.
3. Written post to the controller address.

## Identity check (every channel)
- In-app: the caller is already authenticated; the function verifies the
  token with `checkRevoked`.
- Email / post: require the requester to confirm their registered email
  address and a second factor where available.  Record the verification
  method and timestamp in `dsarLog/{id}`.

## Response steps
1. Confirm receipt within VERIFY statutory period.
2. Assemble the export from `users/{uid}` and its subcollections
   (profile, consents, sessions, messages).  Never include server-only
   collections (usage, reservations, rate limits, reports, evidence).
3. Deliver by secure download or encrypted email.
4. Record the completion timestamp.

## Correction
- Name and email correction is a separate right.  The client updates
  `displayName` (allowed by rules); email changes go through Firebase
  Auth re-authentication.

## Objection and consent withdrawal
- Withdraw any consent in Settings.  The chat endpoint re-checks at
  reservation time (R13).  Withdrawal does not delete existing data unless
  a retention period has elapsed.

## Response times
VERIFY: NDPA statutory period for access, correction, erasure and
objection.  Log every request against these deadlines.