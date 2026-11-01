'use strict';

/**
 * functions/src/config/policy.js
 *
 * Single source of truth for the privacy policy version and the consent
 * types the product recognises.  Every server-side consent check reads
 * POLICY_VERSION from here so a bump in one place invalidates stale
 * consents everywhere.
 *
 * DRAFT — the legal text in privacy.html / terms.html must be reviewed by
 * a Nigerian-qualified lawyer before this value is raised on the live
 * channel.
 */
const POLICY_VERSION = process.env.POLICY_VERSION || '2026-10-31-draft-1';

const CONSENT_TYPES = {
  terms_privacy:  { required: true,  description: 'I agree to the Terms of Service and the Privacy Notice' },
  age_18:         { required: true,  description: 'I am 18 years of age or older' },
  training:       { required: false, description: 'I allow my anonymised conversations to be used to improve the model' },
  analytics:      { required: false, description: 'I allow product analytics' },
};

// The minimum set that must be granted before a chat message can be sent.
const REQUIRED_CONSENTS = Object.entries(CONSENT_TYPES)
  .filter(([, v]) => v.required)
  .map(([k]) => k);

module.exports = { POLICY_VERSION, CONSENT_TYPES, REQUIRED_CONSENTS };