/**
 * src/modules/modal.js
 *
 * Tiny modal helpers.  No browser prompt()/confirm() — everything goes
 * through here so it can be themed and keyboard-accessible.
 */
const $ = id => document.getElementById(id);

export const Modal = {
  alert(message, { title = 'YorùbáGPT' } = {}) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <h2 id="modal-title">${title}</h2>
          <p id="modal-message">${message}</p>
          <button id="modal-ok" class="auth-submit-btn" type="button">OK</button>
        </div>`;
      document.body.appendChild(overlay);
      const ok = () => { overlay.remove(); resolve(true); };
      $('modal-ok')?.addEventListener('click', ok);
      overlay.addEventListener('click', e => { if (e.target === overlay) ok(); });
      document.addEventListener('keydown', function handler(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', handler); ok(); }
      }, { once: true });
      $('modal-ok')?.focus();
    });
  },
  confirm(message, { title = 'YorùbáGPT', danger = false } = {}) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-card${danger ? ' modal-card--danger' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <h2 id="modal-title">${title}</h2>
          <p id="modal-message">${message}</p>
          <div class="modal-actions">
            <button id="modal-cancel" class="auth-secondary-btn" type="button">Cancel</button>
            <button id="modal-confirm" class="auth-submit-btn${danger ? ' danger' : ''}" type="button">${danger ? 'Delete' : 'OK'}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const cleanup = (result) => { overlay.remove(); resolve(result); };
      $('modal-cancel')?.addEventListener('click', () => cleanup(false));
      $('modal-confirm')?.addEventListener('click', () => cleanup(true));
      overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
      document.addEventListener('keydown', function handler(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', handler); cleanup(false); }
        if (e.key === 'Enter') { document.removeEventListener('keydown', handler); cleanup(true); }
      }, { once: true });
      $('modal-confirm')?.focus();
    });
  },
  prompt(message, initial = '', { title = 'YorùbáGPT' } = {}) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <h2 id="modal-title">${title}</h2>
          <p id="modal-message">${message}</p>
          <input id="modal-input" type="text" value="${initial}" class="form-field-input" />
          <div class="modal-actions">
            <button id="modal-cancel" class="auth-secondary-btn" type="button">Cancel</button>
            <button id="modal-confirm" class="auth-submit-btn" type="button">OK</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const input = $('modal-input');
      const cleanup = (result) => { overlay.remove(); resolve(result); };
      $('modal-cancel')?.addEventListener('click', () => cleanup(null));
      $('modal-confirm')?.addEventListener('click', () => cleanup(input?.value ?? ''));
      overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(null); });
      input?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); cleanup(input.value); }
        if (e.key === 'Escape') { document.removeEventListener('keydown', handler); cleanup(null); }
      });
      input?.focus(); input?.select();
    });
  },
};