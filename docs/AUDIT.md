# R0 Audit - Baseline from origin/main (c71bc6c)

Date: 2026-11-02 01:40:08

## Tagged branches

- archive/fix-master-upgrade-v2 -> origin/fix/master-upgrade-v2
- archive/voice -> 3a5b63b

## Broken items found

### B1/B2 - Template literal damage

**functions/src/handlers/consent.js:**

- Line 23: \db.doc(users//consents/)\ - missing template
- Line 35: \db.doc(users//consents/)\ - missing template  
- Line 52: \db.collection(users//consents)\ - missing template
- Line 60: \db.doc(users//consents/)\ - missing template

**functions/src/middleware/authz.js:**

- Line 19: \db.doc(users//consents/)\ - missing template

**functions/src/middleware/rateLimit.js:**

- Lines 13, 27, 28, 55 - need inspection

**scripts/check-transfers.js:**

- Line 58 - regex damage

**scripts/migrate-sessions.js:**

- Line 17 - template damage

**src/services/audioService.js:**

- Line 18 - template damage (will be removed in R8)

### B3 - Conflict markers

- .firebaserc
- .github/workflows/firebase-deploy.yml
- functions/.env.example
