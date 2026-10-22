/**
 * src/modules/modal.js
 * Accessible modal — replaces all browser prompt() / confirm() calls.
 * All text injected via textContent (never innerHTML). Focus trapped. ESC closes.
 */

const ID = 'ygpt-modal-backdrop';
let _built = false;
let _prev  = null;

function build() {
  if (_built) return;
  _built = true;

  const bd = document.createElement('div');
  bd.id = ID;
  bd.setAttribute('role', 'dialog');
  bd.setAttribute('aria-modal', 'true');
  bd.setAttribute('aria-labelledby', 'ygpt-modal-title');
  bd.hidden = true;

  const box = document.createElement('div'); box.className = 'modal-box';
  const ttl = document.createElement('p');   ttl.id = 'ygpt-modal-title'; ttl.className = 'modal-title';
  const inp = document.createElement('input'); inp.id = 'ygpt-modal-input'; inp.className = 'modal-input';
  inp.type = 'text'; inp.autocomplete = 'off'; inp.hidden = true;
  const acts = document.createElement('div'); acts.className = 'modal-actions';
  const can = document.createElement('button'); can.id = 'ygpt-modal-cancel';  can.className = 'modal-btn modal-btn--ghost';   can.type = 'button';
  const ok  = document.createElement('button'); ok.id  = 'ygpt-modal-confirm'; ok.className  = 'modal-btn modal-btn--primary'; ok.type  = 'button';

  acts.appendChild(can); acts.appendChild(ok);
  box.appendChild(ttl); box.appendChild(inp); box.appendChild(acts);
  bd.appendChild(box);
  document.body.appendChild(bd);
}

function els() {
  return {
    bd:  document.getElementById(ID),
    ttl: document.getElementById('ygpt-modal-title'),
    inp: document.getElementById('ygpt-modal-input'),
    can: document.getElementById('ygpt-modal-cancel'),
    ok:  document.getElementById('ygpt-modal-confirm'),
  };
}

function show(opts) {
  build();
  const { bd, ttl, inp, can, ok } = els();

  ttl.textContent = opts.title;
  ok.textContent  = opts.okLabel  ?? 'Ìdánilójú';
  can.textContent = opts.canLabel ?? 'Fagilé';

  ok.classList.toggle('modal-btn--danger',  !!opts.danger);
  ok.classList.toggle('modal-btn--primary', !opts.danger);

  inp.hidden = !opts.hasInput;
  can.hidden = !!opts.alertOnly;
  inp.value  = opts.inputDefault ?? '';

  _prev       = document.activeElement;
  bd.hidden   = false;
  bd.removeAttribute('aria-hidden');

  const focusable = [inp, can, ok].filter(e => !e.hidden);
  requestAnimationFrame(() => (opts.hasInput ? inp : ok).focus());

  const trap = e => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const i = focusable.indexOf(document.activeElement);
    focusable[(i + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus();
  };
  document.addEventListener('keydown', trap);

  return new Promise(resolve => {
    const close = result => {
      bd.hidden = true;
      bd.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', trap);
      ok.removeEventListener('click', onOk);
      can.removeEventListener('click', onCan);
      document.removeEventListener('keydown', onEsc);
      _prev?.focus();
      resolve(result);
    };
    const onOk  = () => close(opts.hasInput ? (inp.value.trim() || null) : true);
    const onCan = () => close(opts.hasInput ? null : false);
    const onEsc = e => { if (e.key === 'Escape') onCan(); };

    ok.addEventListener('click', onOk);
    can.addEventListener('click', onCan);
    document.addEventListener('keydown', onEsc);
    if (opts.hasInput) inp.addEventListener('keydown', e => { if (e.key === 'Enter') onOk(); }, { once: true });
  });
}

export const Modal = {
  confirm: (msg, opts = {}) => show({ title: msg, danger: opts.danger ?? false, okLabel: opts.okLabel ?? 'Ìdánilójú' }),
  prompt:  (msg, def = '')  => show({ title: msg, hasInput: true, inputDefault: def, okLabel: 'Fipamọ́' }),
  alert:   (msg)            => show({ title: msg, alertOnly: true, okLabel: 'Ó dára' }),
};
