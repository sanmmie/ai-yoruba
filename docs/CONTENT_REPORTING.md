# CONTENT_REPORTING.md

DRAFT.  Triage SLA and escalation steps are placeholders to be confirmed
with counsel and the moderation team.

## Report flow
1. The Report action on an assistant message opens a form with categories:
   `inaccurate`, `harmful`, `offensive_or_culturally_disrespectful`,
   `privacy`, `other`, plus optional free text.
2. The report is written to `reports/{reportId}` server-side, rate limited
   and deduplicated per (messageId, uid).  It contains the reported message
   only — never the whole chat — unless the user opts to include context.
3. `scripts/reports-triage.js` lists open reports.

## Triage SLA
VERIFY: target review time.  Placeholder: 2 business days.

## Steps on a confirmed report
1. Inaccurate → correct or annotate; consider a model prompt fix.
2. Harmful / offensive / culturally disrespectful → remove or annotate the
   message; escalate if defamatory or unlawful.
3. Privacy → delete the message and notify the affected person.
4. Other → route to the appropriate owner.

## Escalation
Potentially defamatory or unlawful content is escalated to counsel under
the applicable defamation and cybercrime laws.  VERIFY the applicable
statutes and thresholds with a Nigerian-qualified lawyer.

## Retention
Reports are retained for VERIFY period then deleted.