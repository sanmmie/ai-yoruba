'use strict';

import { t } from '../i18n/i18n.js';
import { Modal as _Modal } from '../modal.js';
import { toast } from './toast.js';
import { auth } from '../firebase-config.js';

const CONSENT_URL = 'https://us-central1-ai-yoruba.cloudfunctions.net/consentFunctions';

async function callConsent(action, data = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('unauthenticated');
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

async function call(action, data) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const { functions } = await import('../firebase-config.js');
  const fn = httpsCallable(getFunctions(functions.app, 'us-central1'), action);
  const r = await fn(data || {});
  return r.data;
}

export async function openSettings({ uid: _uid, plan: _plan, consents: _consents, retention: _retention, onDeleteAccount }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card modal-card--wide" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <h2 id="settings-title"></h2>

      <section class="settings-section">
        <h3></h3>
        <div id="settings-consents" class="settings-consents"></div>
        <label class="settings-row">
          <span></span>
          <select id="settings-retention" class="form-field-input">
            <option value="7"> 7</option>
            <option value="30" selected>30</option>
            <option value="90">90</option>
            <option value="365">365</option>
          </select>
        </label>
      </section>

      <section class="settings-section">
        <h3>Data</h3>
        <div class="settings-actions">
          <button id="settings-download" class="auth-secondary-btn" type="button"></button>
          <button id="settings-delete-chats" class="auth-secondary-btn" type="button"></button>
          <button id="settings-delete-account" class="auth-secondary-btn danger" type="button"></button>
        </div>
      </section>

      <div id="settings-error" class="auth-error" role="alert" aria-live="assertive"></div>
      <div class="modal-actions">
        <button id="settings-close" class="auth-secondary-btn" type="button">Close</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const consentsEl = overlay.querySelector('#settings-consents');
  const list = await callConsent('list');
  for (const c of (list.consents || [])) {
    const row = document.createElement('div');
    row.className = 'settings-consent';
    const label = document.createElement('span');
    label.textContent = c.type;
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = Boolean(c.granted);
    toggle.disabled = c.type === 'terms_privacy' || c.type === 'age_18';
    toggle.addEventListener('change', async () => {
      try {
        await callConsent('record', { type: c.type, granted: toggle.checked });
      } catch (e) {
        toggle.checked = !toggle.checked;
        const err = overlay.querySelector('#settings-error');
        if (err) { err.textContent = t('errors.generic'); err.classList.add('visible'); }
      }
    });
    row.appendChild(label);
    row.appendChild(toggle);
    consentsEl.appendChild(row);
  }

  overlay.querySelector('#settings-close')?.addEventListener('click', () => overlay.remove());
  overlay.querySelector('#settings-download')?.addEventListener('click', async () => {
    try {
      const data = await call('exportUserData', {});
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yorubagpt-data-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Downloaded');
    } catch (e) {
      const err = overlay.querySelector('#settings-error');
      if (err) { err.textContent = t('errors.generic'); err.classList.add('visible'); }
    }
  });
  overlay.querySelector('#settings-delete-chats')?.addEventListener('click', async () => {
    if (!confirm('Delete all chats?')) return;
    try {
      await call('deleteUserData', { scope: 'chats' });
      toast('Chats deleted');
    } catch (e) {
      const err = overlay.querySelector('#settings-error');
      if (err) { err.textContent = t('errors.generic'); err.classList.add('visible'); }
    }
  });
  overlay.querySelector('#settings-delete-account')?.addEventListener('click', async () => {
    if (!confirm('Delete account and all data? This cannot be undone.')) return;
    try {
      await onDeleteAccount?.();
      overlay.remove();
    } catch (e) {
      const err = overlay.querySelector('#settings-error');
      if (err) { err.textContent = t('errors.generic'); err.classList.add('visible'); }
    }
  });
}
