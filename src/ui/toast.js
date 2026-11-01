'use strict';

/**
 * src/ui/toast.js
 *
 * Transient feedback toasts.  Replaces the old header status bar and the
 * trash button beside Send.
 */
const container = () => {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  return c;
};

export function toast(message, { type = 'info', duration = 3500 } = {}) {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  container().appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  if (duration > 0) {
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 250);
    }, duration);
  }
  return el;
}

export function success(message) { return toast(message, { type: 'success' }); }
export function error(message)   { return toast(message, { type: 'error' }); }
export function info(message)    { return toast(message, { type: 'info' }); }