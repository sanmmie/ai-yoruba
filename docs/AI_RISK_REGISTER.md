# AI_RISK_REGISTER.md

Nigeria has no AI statute in force as of the last check — VERIFY with
counsel. The NDPA's rules on DPIAs and automated processing already apply.

| # | Risk | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|---|
| 1 | Inaccurate cultural, religious, medical or legal answers | Medium | High | System-prompt rules; in-app "can make mistakes" notice linked to Terms; Report action; brief caution on medical/legal/financial answers | BUILT |
| 2 | Harmful or defamatory output | Low | High | Refusal rules in system prompt; Report action; triage runbook (docs/CONTENT_REPORTING.md) | BUILT |
| 3 | Prompt injection / persona override | Medium | Medium | System prompt rule 10; user content only in user-role messages; never logged | BUILT |
| 4 | Privacy leakage (message content in logs, Sentry, analytics) | Low | High | adminLogger redacts UIDs and emails; usageLogs hold token counts only; analytics events carry no content; analytics consent gate | BUILT |
| 5 | Minors using the product | Medium | High | 18+ declaration at sign-in; parental consent options documented in docs/DPIA.md | BUILT |
| 6 | Cultural disrespect in output | Medium | Medium | System prompt rules 3, 4, 8; Report category "culturally disrespectful" | BUILT |
| 7 | Quota/rate-limit bypass | Medium | Medium | Server-side transactions, leases, idempotency keys, RACE-CONDITION REGISTER tests | BUILT |
| 8 | Nigeria has no AI statute | Certain | Low | Monitor legislation; document in this register | PENDING |