
import { auth } from '../firebase-config.js';
import { t } from '../i18n/i18n.js';

const $ = id => document.getElementById(id);

const CONSENT_URL =
  'https://us-central1-ai-yoruba.cloudfunctions.net/consentFunctions';

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
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ action, ...data })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || ('consent_error_' + res.status));
  }

  return res.json();
}

export function mountConsentGate(onReady) {
  const gate = document.getElementById('consent-gate');

  if (!gate) return;

  gate.hidden = false;

  renderConsentGate();
  wireConsentGate(onReady);
}

function renderConsentGate() {
  const gate = document.getElementById('consent-gate');

  if (!gate) return;

  gate.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'consent-card';

  card.innerHTML = `
    <h2>${t('consent.title')}</h2>

    <p class="consent-sub">${t('consent.termsPrivacy')}</p>

    <label class="consent-check">
      <input type="checkbox" id="consent-terms" />
      <span>${t('consent.termsPrivacy')}</span>
    </label>

    <label class="consent-check">
      <input type="checkbox" id="consent-age" />
      <span>${t('consent.age18')}</span>
    </label>

    <label class="consent-check consent-optional">
      <input type="checkbox" id="consent-training" />
      <span>${t('consent.training')}</span>
    </label>

    <label class="consent-check consent-optional">
      <input type="checkbox" id="consent-analytics" />
      <span>${t('consent.analytics')}</span>
    </label>

    <div
      id="consent-error"
      class="auth-error"
      role="alert"
      aria-live="assertive"
    ></div>

    <button
      id="consent-continue"
      class="auth-submit-btn"
      type="button"
      disabled
    >Continue</button>
  `;

  gate.appendChild(card);

  const terms = document.getElementById('consent-terms');
  const age = document.getElementById('consent-age');
  const continueBtn = document.getElementById('consent-continue');

  const update = () => {
    if (continueBtn) {
      continueBtn.disabled = !(terms?.checked && age?.checked);
    }
  };

  terms?.addEventListener('change', update);
  age?.addEventListener('change', update);
}

function wireConsentGate(onReady) {
  const btn = document.getElementById('consent-continue');
  const err = document.getElementById('consent-error');

  btn?.addEventListener('click', async () => {
    if (btn) btn.disabled = true;

    try {
      const user = auth.currentUser;

      if (!user) {
        if (err) {
          err.textContent = t('errors.unauthenticated');
          err.classList.add('visible');
        }

        if (btn) btn.disabled = false;
        return;
      }

      const locale = localStorage.getItem('ygpt_locale') || 'en';

      await callConsent('record', {
        type: 'terms_privacy',
        granted: document.getElementById('consent-terms')?.checked,
        locale
      });

      await callConsent('record', {
        type: 'age_18',
        granted: document.getElementById('consent-age')?.checked,
        locale
      });

      await callConsent('record', {
        type: 'training',
        granted: document.getElementById('consent-training')?.checked,
        locale
      });

      await callConsent('record', {
        type: 'analytics',
        granted: document.getElementById('consent-analytics')?.checked,
        locale
      });

      const verify = await callConsent('verify');

      if (!verify.ok) {
        if (err) {
          err.textContent = t('consent.declineMessage');
          err.classList.add('visible');
        }

        if (btn) btn.disabled = false;
        return;
      }

      const gate = document.getElementById('consent-gate');

      if (gate) gate.remove();

      onReady?.();

    } catch (e) {
      console.error('Consent submission failed:', e);

      if (err) {
        err.textContent = t('errors.generic');
        err.classList.add('visible');
      }

      if (btn) btn.disabled = false;
    }
  });
}

export async function ensureConsented() {
  try {
    const r = await callConsent('verify');
    return Boolean(r.ok);
  } catch {
    return false;
  }
}

export async function listConsents() {
  try {
    const r = await callConsent('list');
    return r.consents || [];
  } catch {
    return [];
  }
}
