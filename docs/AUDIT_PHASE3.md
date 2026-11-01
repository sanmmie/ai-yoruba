# Phase 3 decision — Firestore sessions

**Date:** 2026-11-01  
**Branch:** fix/chatgpt-quality

## Choice: Path B (narrow client writes)

### Why
- `src/modules/sessions.js` still performs client `setDoc` / `updateDoc` for create, rename, draft, and history.
- No session Cloud Function exists yet; `functions/src/index.js` still has merge conflicts.
- Path A (server-owned) rules would break New Chat / rename / draft with `permission-denied`.

### What Path B allows (owner only)
- **create** session: keys only `title`, `history`, `draft`, `createdAt`, `updatedAt`; empty history/draft; title ≤ 200 chars
- **update** session: only `title`, `history`, `draft`, `updatedAt`; history ≤ 100; draft ≤ 4000
- **delete** session: owner
- **messages** subcollection: client create denied; only `feedback` updatable by owner

### Residual risk
- Client can write `history` arrays (trusted shape limits only). A compromised client could inflate history within the 100-message cap.
- Quota / plan enforcement must remain server-side on the AI endpoint (not on session create).

### Follow-up (Path A)
1. Resolve conflicts in `functions/src/index.js`
2. Add callable/HTTP handlers: `createSession`, `renameSession`, `saveDraft` (admin SDK writes)
3. Point `sessions.js` at those endpoints
4. Flip rules back to `allow create, update: if false` on sessions
5. Let `yorubaAIv2` own message history in the `messages` subcollection

Until Path A is done, do not deploy the previous strict Path A rules.
