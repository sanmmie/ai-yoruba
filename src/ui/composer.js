'use strict';

/**
 * src/ui/composer.js
 *
 * Floating rounded composer pinned to the bottom.
 *
 *  - Auto-growing textarea up to about 40% of the viewport.
 *  - Enter sends, Shift+Enter newline, Enter ignored during IME composition.
 *  - Send disabled when empty or while streaming and replaced by Stop.
 *  - No hard maxlength, with a soft counter past 80% of MAX_INPUT_CHARS.
 *  - Double-click and key-repeat are ignored while sending (R10).
 */
import { t } from '../i18n/i18n.js';
import { toast } from './toast.js';

const MAX_INPUT_CHARS = parseInt(import.meta.env.VITE_MAX_INPUT_CHARS || '8000', 10);

export function mountComposer({ onSend, onStop, onAddToneMarks }) {
  const wrap = document.getElementById('composer-wrap');
  if (!wrap) return null;

  const bar = document.createElement('div');
  bar.className = 'composer';
  bar.innerHTML = `
    <textarea id="composer-input" class="composer__textarea" rows="1" placeholder="${t('chat.placeholder')}" maxlength="${MAX_INPUT_CHARS}" aria-label="Message"></textarea>
    <div class="composer__footer">
      <span id="composer-count" class="composer__count"></span>
      <span class="composer__hint">${t('chat.sensitiveNotice')}</span>
    </div>
    <div class="composer__actions">
      <button id="composer-tone-btn" class="icon-btn" type="button" title="Add tone marks" aria-label="Add tone marks">ẹ ọ ṣ</button>
      <button id="composer-send-btn" class="composer__send" type="button" aria-label="${t('chat.send')}">${t('chat.send')}</button>
    </div>
  `;
  wrap.appendChild(bar);

  const ta = bar.querySelector('#composer-input');
  const count = bar.querySelector('#composer-count');
  const sendBtn = bar.querySelector('#composer-send-btn');
  const stopBtn = document.createElement('button');
  stopBtn.className = 'composer__send composer__send--stop';
  stopBtn.type = 'button';
  stopBtn.textContent = t('chat.stop');
  stopBtn.style.display = 'none';
  bar.querySelector('.composer__actions').appendChild(stopBtn);

  let sending = false;
  let composing = false;

  function updateCount() {
    const len = ta.value.length;
    const pct = len / MAX_INPUT_CHARS;
    count.textContent = `${len} / ${MAX_INPUT_CHARS}`;
    count.classList.toggle('composer__count--warn', pct >= 0.8);
    sendBtn.disabled = !ta.value.trim() || sending;
  }

  function autoGrow() {
    ta.style.height = 'auto';
    const max = Math.min(window.innerHeight * 0.4, 400);
    ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
  }

  ta.addEventListener('input', () => { updateCount(); autoGrow(); });
  ta.addEventListener('compositionstart', () => { composing = true; });
  ta.addEventListener('compositionend', () => { composing = false; });
  ta.addEventListener('keydown', (e) => {
    if (composing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sending && ta.value.trim()) send();
    }
  });

  sendBtn.addEventListener('click', () => { if (!sending && ta.value.trim()) send(); });
  stopBtn.addEventListener('click', () => { onStop?.(); });

  async function send() {
    const text = ta.value.trim();
    if (!text || sending) return;
    sending = true;
    sendBtn.disabled = true;
    stopBtn.style.display = 'inline-flex';
    ta.disabled = true;
    try {
      await onSend?.(text);
      ta.value = '';
      updateCount();
      autoGrow();
    } catch (e) {
      toast(t('errors.generic'), { type: 'error' });
    } finally {
      sending = false;
      ta.disabled = false;
      stopBtn.style.display = 'none';
      sendBtn.disabled = !ta.value.trim();
      ta.focus();
    }
  }

  bar.querySelector('#composer-tone-btn')?.addEventListener('click', () => {
    onAddToneMarks?.(ta);
  });

  updateCount();
  autoGrow();
  return {
    focus: () => ta.focus(),
    setValue: (v) => { ta.value = v; updateCount(); autoGrow(); },
    clear: () => { ta.value = ''; updateCount(); autoGrow(); },
    setStreaming: (on) => {
      sending = on;
      sendBtn.disabled = !ta.value.trim() || sending;
      stopBtn.style.display = on ? 'inline-flex' : 'none';
    },
  };
}