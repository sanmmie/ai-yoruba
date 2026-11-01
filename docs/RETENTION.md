# RETENTION.md (DRAFT)

- Policy version: POLICY_VERSION = VERIFY
- Sessions/messages: expireAt derived from last activity (anonymous shorter). TTL mechanism: Firestore TTL policy or scheduled deletion job (VERIFY support). Document choice.
- Server logs: short TTL (VERIFY)
- Backups: Firestore backup/PITR retention - record in docs (VERIFY). Tombstones in deletedUsers/{uid} for restore scenarios.
- Consent records: minimal pseudonymised form only if counsel approves (VERIFY)
