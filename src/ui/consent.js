/**
 * src/ui/consent.js
 *
 * Consent screen shown before the first chat.  Reads and writes consent
 * records through the server (consentFunctions) — the client never writes
 * consent directly.  Blocks chat until the required records exist and are
 * current against POLICY_VERSION.
 */
import { auth } from '../firebase-config.js';
import { t } from '../i18n/i18n.js';

const $ = id => document.getElementById(id);

let _functions = null;
async function callConsent(action, data) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  if (!_functions) _functions = getFunctions(auth.app, 'us-central1');
  const fn = httpsCallable(_functions, 'consentFunctions');
  const r = await fn({ action, ...data });
  return r.data;
}

export function mountConsentGate(onReady) {
  const gate = $('consent-gate');
  if (!gate) return;
  gate.hidden = false;
  renderConsentGate();
  wireConsentGate(onReady);
}

function renderConsentGate() {
  const gate = $('consent-gate');
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
    <div id="consent-error" class="auth-error" role="alert" aria-live="assertive"></div>
    <button id="consent-continue" class="auth-submit-btn" type="button" disabled>Continue</button>
  `;
  gate.appendChild(card);
  const terms = $('consent-terms');
  const age = $('consent-age');
  const continueBtn = $('consent-continue');
  const update = () => { if (continueBtn) continueBtn.disabled = !(terms.checked && age.checked); };
  terms.addEventListener('change', update);
  age.addEventListener('change', update);
}

function wireConsentGate(onReady) {
  const btn = $('consent-continue');
  const err = $('consent-error');
  btn?.addEventListener('click', async () => {
    if (btn) btn.disabled = true;
    try {
      const user = auth.currentUser;
      if (!user) { if (err) { err.textContent = t('errors.unauthenticated'); err.classList.add('visible'); } return; }
      const locale = localStorage.getItem('ygpt_locale') || 'en';
      await callConsent('record', { type: 'terms_privacy', granted: $('consent-terms').checked, locale });
      await callConsent('record', { type: 'age_18', granted: $('consent-age').checked, locale });
      await callConsent('record', { type: 'training', granted: $('consent-training').checked, locale });
      await callConsent('record', { type: 'analytics', granted: $('consent-analytics').checked, locale });
      const verify = await callConsent('verify');
      if (!verify.ok) {
        if (err) { err.textContent = t('consent.declineMessage'); err.classList.add('visible'); }
        if (btn) btn.disabled = false;
        return;
      }
      const gate = $('consent-gate');
      if (gate) gate.remove();
      onReady?.();
    } catch (e) {
      if (err) { err.textContent = t('errors.generic'); err.classList.add('visible'); }
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
  const r = await callConsent('list');
  return r.consents || [];
}