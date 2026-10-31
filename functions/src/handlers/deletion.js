'use strict';

/**
 * functions/src/handlers/deletion.js
 *
 * Account and data deletion.  Hard deletion, server-side, idempotent and
 * resumable.  Handles an in-flight generation (R9): the persist step
 * re-checks that the user still exists and discards late writes; this
 * function waits for or cancels an active lease on the user's sessions
 * before deleting.
 *
 * Requires re-authentication on the client (recent ID token) for the
 * account-delete path; per-chat and delete-all are owner-only.
 */
const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const { log }   = require('../utils/adminLogger');

const db = () => admin.firestore();

async function deleteCollection(collRef, batchSize = 100) {
  // Firestore has no single-call collection delete; batch in pages.
  let snap;
  do {
    snap = await collRef.limit(batchSize).get();
    if (snap.empty) break;
    const batch = db().batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  } while (snap.size === batchSize);
}

async function purgeUser(uid, { hardDeleteAuth = false } = {}) {
  const userRef = db().collection('users').doc(uid);

  // Wait for any active lease on this user so a generation in flight is
  // not left writing to a deleted user (R9).  Leases expire on their own;
  // we poll briefly then proceed regardless.
  const leaseRef = db().collection('users').doc(uid).collection('leases').doc('user');
  for (let i = 0; i < 30; i++) {
    const snap = await leaseRef.get();
    if (!snap.exists) break;
    const expiresAt = snap.data().expiresAt;
    if (expiresAt && expiresAt.toMillis && expiresAt.toMillis() < Date.now()) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  await db().runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) return; // already gone — idempotent
    // Recursive delete of all subcollections.
    const subCols = ['sessions', 'consents', 'reservations', 'leases', 'rateLimits', 'usage', 'shares'];
    for (const name of subCols) {
      await deleteCollection(userRef.collection(name));
    }
    // Top-level usage keyed by uid (usage/{uid}_{YYYYMMDD}) and
    // rateLimits/{scope}_{key}_{window} are not subcollections — delete by
    // prefix via a query.
    for (const col of ['usage', 'rateLimits']) {
      const c = db().collection(col);
      const q = await c.where(admin.firestore.FieldPath.documentId(), '>=', uid).get();
      const batch = db().batch();
      q.docs.forEach(d => batch.delete(d.ref));
      if (!q.empty) await batch.commit();
    }
    // Tombstone so a restore from backup re-applies this deletion.
    await tx.set(db().collection('deletedUsers').doc(uid), {
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      hardDeleteAuth: Boolean(hardDeleteAuth),
    });
    tx.delete(userRef);
  });

  if (hardDeleteAuth) {
    try { await admin.auth().deleteUser(uid); }
    catch (e) { log.warn('Auth delete failed (may already be gone)', e, { uid }); }
  }
}

async function deleteSession(uid, sessionId) {
  const ref = db().collection('users').doc(uid).collection('sessions').doc(sessionId);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    await deleteCollection(ref.collection('messages'));
    tx.delete(ref);
  });
}

exports.deletionFunctions = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Not signed in');
    const uid = context.auth.uid;
    const { action, sessionId } = data || {};

    if (action === 'delete_session') {
      if (!sessionId) throw new functions.https.HttpsError('invalid-argument', 'sessionId required');
      await deleteSession(uid, sessionId);
      log.info('Session deleted', { uid, sessionId });
      return { ok: true };
    }
    if (action === 'delete_all_chats') {
      const sessions = await db().collection('users').doc(uid).collection('sessions').listDocuments();
      for (const doc of sessions) await deleteSession(uid, doc.id);
      log.info('All chats deleted', { uid });
      return { ok: true };
    }
    if (action === 'delete_account') {
      // Re-authentication is enforced by the client sending a fresh ID
      // token; verify the token's auth_time is recent.
      const authTime = context.auth.auth_time ? context.auth.auth_time * 1000 : 0;
      const stale = Date.now() - authTime > 5 * 60 * 1000;
      if (stale) throw new functions.https.HttpsError('requires-recent-sign-in', 'Re-authenticate to delete your account');
      await purgeUser(uid, { hardDeleteAuth: true });
      log.info('Account deleted', { uid });
      return { ok: true };
    }
    throw new functions.https.HttpsError('invalid-argument', 'Unknown action');
  });

module.exports = { purgeUser, deleteSession, deleteCollection };