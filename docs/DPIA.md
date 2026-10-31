# DPIA.md — Data Protection Impact Assessment

DRAFT — for review by a Nigerian-qualified lawyer.

## Nature and scope
- Product: YorùbáGPT, an AI conversational product.
- Data subjects: registered users and anonymous trial users.
- Data: names, emails, Google profile data, full chat histories, usage data, device data, payment identifiers.
- Processing: storage in Firestore (nam5), processing in Cloud Functions (us-central1), inference at the Anthropic API.

## Risks
1. **Sensitive-category exposure.** Chats may reveal religion (Ifá, Orisha, church, mosque), health, family status and other sensitive categories. Mitigation: in-app notice not to share sensitive personal details; system-prompt rule not to solicit them; brief caution on medical, legal and financial answers.
2. **Cross-border transfer.** See docs/TRANSFERS.md. Each vendor must have a recorded safeguard.
3. **Retention without a limit.** Mitigation: expireAt on sessions and messages, TTL or scheduled reaper, user-facing retention setting.
4. **Consent bypass.** Mitigation: server-recorded consents, checked at reservation time (R13), policyVersion invalidation.
5. **Automated quota and abuse blocks.** Mitigation: human review route; no solely automated decision with legal or similarly significant effect is made.
6. **Minors.** Mitigation: 18+ declaration at sign-in. Parental consent not built — see options below.

## Residual risk
Medium until counsel reviews the retention periods, the transfer safeguards and the consent records.

## Parental consent options (for decision)
- Verifiable parental consent flow.
- School or institutional accounts.
- Age-appropriate limited tier.
Document the chosen approach in this file before launch.

## Automated decision analysis
Quota enforcement and rate limiting are automated. They do not produce legal or similarly significant effects on data subjects. A human can review a blocked account via the contact route recorded in this document.

## Sign-off
Controller: VERIFY. DPO: VERIFY. Date: VERIFY.