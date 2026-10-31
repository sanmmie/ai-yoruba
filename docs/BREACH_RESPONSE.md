# BREACH_RESPONSE.md — Data breach response plan

DRAFT.  VERIFY the statutory notification periods with a Nigerian-qualified
lawyer; do not state them from memory.

## Contact tree
- Controller: VERIFY
- DPO: VERIFY
- Counsel: VERIFY
- NDPC contact point: VERIFY (ndpc.gov.ng)
- Vendor incident contacts: Stripe, Flutterwave, Anthropic, Firebase

## Phases

### 1. Detect
- Monitoring: Sentry error rate, unusual webhook rejections, failed
  signature checks, quota anomalies, Firestore access-denied spikes.
- Admins are notified by the triage script `scripts/reports-triage.js`.

### 2. Contain
- Revoke exposed credentials via the Firebase console or Admin SDK.
- Rotate the Anthropic API key, Stripe and Flutterwave keys.
- Disable the affected account or feature flag.

### 3. Assess
- What data was involved? Categories from ROPA.md.
- Was it encrypted at rest and in transit?
- Can affected data subjects be identified and notified?
- Is this a notifiable breach under the NDPA? VERIFY the threshold with
  counsel.

### 4. Notify
- NDPC within VERIFY statutory period.
- Affected users within VERIFY statutory period, in plain language.
- Vendors per their incident contracts.

### 5. Remediate and review
- Fix the root cause; record it here.
- Update the risk register (docs/AI_RISK_REGISTER.md) and DPIA.
- Schedule a review within VERIFY period.

## Log template
Store every breach in `breaches/{id}` with fields:
`detectedAt, containedAt, categories, affectedCount, ndpcNotifiedAt,
userNotifiedAt, rootCause, remediation, reviewDate, signOff`.

## Rehearsal
Run a tabletop exercise annually. Record the date and outcome here.