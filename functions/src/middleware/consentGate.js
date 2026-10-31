'use strict';

/**
 * functions/src/middleware/consentGate.js
 *
 * Standalone consent check used by the chat endpoint at reservation time
 * (R13).  A withdrawal racing a chat request is evaluated atomically here
 * because the reservation transaction re-reads the consents.
 */
const { verifyRequiredConsents } = require('../handlers/consent');

async function requireConsents(uid) {
  const result = await verifyRequiredConsents(uid);
  if (!result.ok) {
    const err = new Error('consent_required');
    err.code = 'consent_required';
    err.missing = result.missing;
    err.policyVersion = result.policyVersion;
    throw err;
  }
  return result;
}

module.exports = { requireConsents };