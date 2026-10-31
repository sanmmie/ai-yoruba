'use strict';

/**
 * functions/src/handlers/cleanup.js
 *
 * Account-deletion cleanup.  Triggered by Firebase Auth on userDeleted
 * (v1 builder: functions.auth.user({ ... }).onDelete).  Also exposed as a
 * callable for manual re-runs by an admin.  Idempotent and safe to call on
 * a user that has already been purged.
 */
const functions = require('firebase-functions');
const { purgeUser } = require('./deletion');

exports.cleanupUserData = functions.auth.user({ timeoutSeconds: 300 }).onDelete(async (user) => {
  await purgeUser(user.uid, { hardDeleteAuth: false });
  return null;
});

exports.runCleanupUserData = functions
  .runWith({ timeoutSeconds: 300 })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Not signed in');
    await purgeUser(context.auth.uid, { hardDeleteAuth: false });
    return { ok: true };
  });