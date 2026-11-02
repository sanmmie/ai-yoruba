
import { auth } from '../firebase-config.js';
import { t } from '../i18n/i18n.js';

const $ = id => document.getElementById(id);

const CONSENT_URL =
  'https://us-central1-ai-yoruba.cloudfunctions.net/consentFunctions';

/**
 * Send an authenticated request to the consent Cloud Function.
 */
async function callConsent(action, data = {}) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('unauthenticated');
  }

  const token = await user.getIdToken();

  const res = await fetch(CONSENT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      action,
      ...data
    })
  });

  let result;

  try {
    result = await res.json();
  } catch {
    throw new Error(
      `Invalid consent service response (HTTP ${res.status})`
    );
  }

  if (!res.ok) {
    throw new Error(
      result?.error ||
      result?.message ||
      `consent_error_${res.status}`
    );
  }

  return result;
}

/**
 * Mount the consent gate.
 *
 * Returns true when mounted.
 * Throws when the required HTML element is missing.
 */
export function mountConsentGate(onReady) {
  const gate = $('consent-gate');

  if (!gate) {
    throw new Error(
      'Missing #consent-gate element in index.html'
    );
  }

  renderConsentGate();

  gate.hidden = false;

  wireConsentGate(onReady);

  return true;
}

/**
 * Render the consent interface.
 */
function renderConsentGate() {
  const gate = $('consent-gate');

  if (!gate) {
    throw new Error('Consent gate element not found.');
  }

  gate.replaceChildren();

  const card = document.createElement('div');
  card.className = 'consent-card';

  card.innerHTML = `
    <h2 id="consent-dialog-title">${t('consent.title')}</h2>

    <p class="consent-sub">${t('consent.termsPrivacy')}</p>

    <label class="consent-check">
      <input
        type="checkbox"
        id="consent-terms"
        required
      />
      <span>${t('consent.termsPrivacy')}</span>
    </label>

    <label class="consent-check">
      <input
        type="checkbox"
        id="consent-age"
        required
      />
      <span>${t('consent.age18')}</span>
    </label>

    <label class="consent-check consent-optional">
      <input
        type="checkbox"
        id="consent-training"
      />
      <span>${t('consent.training')}</span>
    </label>

    <label class="consent-check consent-optional">
      <input
        type="checkbox"
        id="consent-analytics"
      />
      <span>${t('consent.analytics')}</span>
    </label>

    <div
      id="consent-error"
      class="auth-error"
      role="alert"
      aria-live="assertive"
      hidden
    ></div>

    <button
      id="consent-continue"
      class="auth-submit-btn"
      type="button"
      disabled
    >Continue</button>
  `;

  gate.appendChild(card);

  const terms = $('consent-terms');
  const age = $('consent-age');
  const continueBtn = $('consent-continue');

  const update = () => {
    if (continueBtn) {
      continueBtn.disabled = !(
        terms?.checked && age?.checked
      );
    }
  };

  terms?.addEventListener('change', update);
  age?.addEventListener('change', update);
}

/**
 * Display an error message.
 */
function showError(element, message) {
  if (!element) return;

  element.textContent = message;
  element.hidden = false;
  element.classList.add('visible');
}

/**
 * Clear the consent error.
 */
function clearError(element) {
  if (!element) return;

  element.textContent = '';
  element.hidden = true;
  element.classList.remove('visible');
}

/**
 * Handle consent submission.
 */
function wireConsentGate(onReady) {
  const btn = $('consent-continue');
  const err = $('consent-error');

  if (!btn) {
    throw new Error('Consent submit button not found.');
  }

  btn.addEventListener('click', async () => {
    clearError(err);

    const termsAccepted = $('consent-terms')?.checked === true;
    const ageConfirmed = $('consent-age')?.checked === true;

    if (!termsAccepted || !ageConfirmed) {
      showError(
        err,
        t('consent.declineMessage')
      );
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      if (!auth.currentUser) {
        throw new Error('unauthenticated');
      }

      const locale =
        localStorage.getItem('ygpt_locale') || 'en';

      const consents = [
        {
          type: 'terms_privacy',
          granted: termsAccepted,
          locale
        },
        {
          type: 'age_18',
          granted: ageConfirmed,
          locale
        },
        {
          type: 'training',
          granted: $('consent-training')?.checked === true,
          locale
        },
        {
          type: 'analytics',
          granted: $('consent-analytics')?.checked === true,
          locale
        }
      ];

      // Record each consent using the existing backend contract.
      for (const consent of consents) {
        await callConsent('record', consent);
      }

      // Verify required consent with the backend.
      const verification = await callConsent('verify');

      if (verification?.ok !== true) {
        throw new Error('consent_verification_failed');
      }

      // Save optional analytics preference locally.
      const analyticsAccepted =
        $('consent-analytics')?.checked === true;

      if (analyticsAccepted) {
        localStorage.setItem(
          'ygpt_analytics_consent',
          'granted'
        );
      } else {
        localStorage.removeItem(
          'ygpt_analytics_consent'
        );
      }

      // Initialize the application before removing the gate.
      if (typeof onReady === 'function') {
        await onReady();
      }

      const gate = $('consent-gate');

      if (gate) {
        gate.hidden = true;
      }

    } catch (e) {
      console.error('Consent submission failed:', e);

      showError(
        err,
        e?.message === 'unauthenticated'
          ? t('errors.unauthenticated')
          : t('errors.generic')
      );

      btn.disabled = false;
      btn.textContent = 'Continue';
    }
  });
}

/**
 * Verify whether required consent already exists.
 *
 * Returns false only when the backend confirms
 * that consent is incomplete.
 *
 * Network and server errors propagate to auth.js.
 */
export async function ensureConsented() {
  const result = await callConsent('verify');

  return result?.ok === true;
}

/**
 * Retrieve previously recorded consent.
 */
export async function listConsents() {
  const result = await callConsent('list');

  return Array.isArray(result?.consents)
    ? result.consents
    : [];
}

/**
 * Hide the consent gate without removing it.
 */
export function hideConsentGate() {
  const gate = $('consent-gate');

  if (gate) {
    gate.hidden = true;
  }
}
