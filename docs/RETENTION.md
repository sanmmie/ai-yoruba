# RETENTION.md

DRAFT — the periods below are PLACEHOLDERS.  Ask the user to choose them
before the live channel is opened; a Nigerian-qualified lawyer must review
them.

## Mechanism
- Sessions and messages carry an `expireAt` derived from last activity
  (touch on each message pair). Anonymous users get a shorter period.
- A scheduled function or Firestore TTL policy deletes expired documents.
  VERIFY which Firestore supports for subcollections and document the
  choice here:
  - Option A: Firestore TTL policy on `expireAt` — supported for top-level
    collections and subcollections in recent SDK versions. VERIFY.
  - Option B: scheduled Cloud Function reaper — currently implemented for
    subscription downgrade; extend it to sessions and messages.
  - Choice: VERIFY with the Firebase team, then record it.
- Server-only logs have their own short TTL.

## Placeholder periods (VERIFY with counsel)
| Data | Period | Mechanism |
|---|---|---|
| Sessions and messages | VERIFY | expireAt + reaper/TTL |
| Anonymous trial sessions | VERIFY (shorter) | expireAt + reaper/TTL |
| Usage and reservation docs | VERIFY | TTL |
| Rate-limit counters | VERIFY | TTL |
| Consent records | VERIFY (may need to survive deletion as proof) | Manual |
| Server logs | VERIFY | TTL |
| Backup copies | VERIFY | Backup retention window |

## User controls
- Retention period is shown in Settings and in the Privacy Notice.
- Users can change the retention setting only within bounds the user
  approves.

## Deletion
- Per-chat delete, delete all chats, and delete my account (re-auth
  required) run server-side with a recursive delete, idempotent and
  resumable. A tombstone list in `deletedUsers/{uid}` lets a restore from
  backup re-apply deletions.

## Backup statement for the notice
Backup copies expire within the recorded window. State the window in the
Privacy Notice once it is verified.