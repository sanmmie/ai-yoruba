'use strict';

/**
 * src/ui/settings.js
 *
 * Settings → Privacy & data dialog.
 *
 *  - Current consents with toggles for analytics and training (OFF by
 *    default).
 *  - Retention period (within bounds the user approves).
 *  - Download my data, delete all chats, delete my account.
 *  - Delete is hard deletion, idempotent and resumable (R9).
 */
import { t } from '../i18n/i18n.js';
import { Modal } from '../modal.js';
import { toast } from './toast.js';

async function call(action, data) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const { functions } = await import('../firebase-config.js');
  const fn = httpsCallable(getFunctions(functions.app, 'us-central1'), action);
  const r = await fn(data || {});
  return r.data;
}

export async function openSettings({ uid, plan, consents, retention, onDeleteAccount }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card modal-card--wide" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <h2 id="settings-title">${t('settings.title')}</h2>

      <section class="settings-section">
        <h3>${t('settings.privacyData')}</h3>
        <div id="settings-consents" class="settings-consents"></div>
        <label class="settings-row">
          <span>${t('settings.retention')}</span>
          <select id="settings-retention" class="form-field-input">
            <option value="7">${t('settings.retention')} 7</option>
            <option value="30" selected>30</option>
            <option value="90">90</option>
            <option value="365">365</option>
          </select>
        </label>
      </section>

      <section class="settings-section">
        <h3>Data</h3>
        <div class="settings-actions">
          <button id="settings-download" class="auth-secondary-btn" type="button">${t('settings.downloadData')}</button>
          <button id="settings-delete-chats" class="auth-secondary-btn" type="button">${t('settings.deleteAllChats')}</button>
          <button id="settings-delete-account" class="auth-secondary-btn danger" type="button">${t('settings.deleteAccount')}</button>
        </div>
      </section>

      <div id="settings-error" class="auth-error" role="alert" aria-live="assertive"></div>
      <div class="modal-actions">
        <button id="settings-close" class="auth-secondary-btn" type="button">Close</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const consentsEl = overlay.querySelector('#settings-consents');
  const list = await call('consentFunctions', { action: 'list' });
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
        await call('consentFunctions', { action: 'record', type: c.type, granted: toggle.checked });
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

  overlay.querySelector('#settings-download')?.addEventListener('click', async () => {
    try {
      const data = await call('exportFunctions', {});
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yorubagpt-data-${uid.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast(t('settings.dataExported'), { type: 'success' });
    } catch (e) {
      const err = overlay.querySelector('#settings-error');
      if (err) { err.textContent = t('errors.generic'); err.classList.add('visible'); }
    }
  });

  overlay.querySelector('#settings-delete-chats')?.addEventListener('click', async () => {
    const ok = await Modal.confirm(t('settings.deleteAllChatsConfirm'), { danger: true });
    if (!ok) return;
    try {
      await call('deletionFunctions', { action: 'delete_all_chats' });
      toast(t('settings.chatsDeleted'), { type: 'success' });
    } catch (e) {
      const err = overlay.querySelector('#settings-error');
      if (err) { err.textContent = t('errors.generic'); err.classList.add('visible'); }
    }
  });

  overlay.querySelector('#settings-delete-account')?.addEventListener('click', async () => {
    const ok = await Modal.confirm(t('settings.deleteAccountConfirm'), { danger: true });
    if (!ok) return;
    try {
      await call('deletionFunctions', { action: 'delete_account' });
      toast(t('settings.accountDeleted'), { type: 'success' });
      await onDeleteAccount?.();
    } catch (e) {
      const err = overlay.querySelector('#settings-error');
      if (err) { err.textContent = t('errors.generic'); err.classList.add('visible'); }
    }
  });

  overlay.querySelector('#settings-close')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') { document.removeEventListener('keydown', handler); overlay.remove(); }
  }, { once: true });
  overlay.querySelector('#settings-close')?.focus();
}