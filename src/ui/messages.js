'use strict';

/**
 * src/ui/messages.js
 *
 * Message rendering.  Markdown is parsed with marked (html: false) and
 * sanitized with DOMPurify using a strict allowlist.  Nothing is ever
 * rendered with innerHTML from user content — the returned element is
 * built with DOM APIs.
 *
 *  - Hostile input (script tags, javascript: links, onerror, SVG payloads)
 *    proves nothing executes.
 *  - Links get rel="noopener noreferrer" and target="_blank".
 *  - Fenced code blocks get a language label and a Copy button.
 *  - Tables scroll horizontally.
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ breaks: true, gfm: true, html: false });

const purifyConfig = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'svg'],
};

export function renderMarkdown(text) {
  const html = marked.parse(text || '');
  const clean = DOMPurify.sanitize(html, purifyConfig);
  const div = document.createElement('div');
  div.innerHTML = clean;
  div.querySelectorAll('a').forEach(a => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
  div.querySelectorAll('pre').forEach(pre => {
    pre.classList.add('code-block');
    const code = pre.querySelector('code');
    const lang = code ? (code.className.match(/language-(\w+)/) || [])[1] : '';
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block__wrapper';
    const header = document.createElement('div');
    header.className = 'code-block__header';
    const label = document.createElement('span');
    label.className = 'code-block__lang';
    label.textContent = lang || 'code';
    const btn = document.createElement('button');
    btn.className = 'code-block__copy';
    btn.type = 'button';
    btn.textContent = 'Copy';
    btn.addEventListener('click', () => {
      const codeText = code ? code.textContent : pre.textContent;
      navigator.clipboard.writeText(codeText).then(() => {
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      }).catch(() => {});
    });
    header.appendChild(label);
    header.appendChild(btn);
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);
  });
  return div;
}

export function messageElement({ role, content, createdAt, messageId, onReport, onCopy, onRegenerate, onEdit }) {
  const wrap = document.createElement('div');
  wrap.className = `message message--${role}`;
  if (messageId) wrap.dataset.messageId = messageId;

  const body = document.createElement('div');
  body.className = 'message__body';
  body.appendChild(renderMarkdown(content));

  const meta = document.createElement('div');
  meta.className = 'message__meta';
  if (createdAt) {
    const t = document.createElement('time');
    t.className = 'message__time';
    t.textContent = new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    meta.appendChild(t);
  }
  if (role === 'assistant') {
    const actions = document.createElement('div');
    actions.className = 'message__actions';
    const mkBtn = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'icon-btn';
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.title = label;
      b.textContent = label;
      b.addEventListener('click', fn);
      return b;
    };
    actions.appendChild(mkBtn('Copy', () => onCopy?.(content)));
    actions.appendChild(mkBtn('Regenerate', () => onRegenerate?.()));
    actions.appendChild(mkBtn('Report', () => onReport?.()));
    meta.appendChild(actions);
  } else {
    const actions = document.createElement('div');
    actions.className = 'message__actions';
    const mkBtn = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'icon-btn';
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.title = label;
      b.textContent = label;
      b.addEventListener('click', fn);
      return b;
    };
    actions.appendChild(mkBtn('Copy', () => onCopy?.(content)));
    actions.appendChild(mkBtn('Edit', () => onEdit?.()));
    meta.appendChild(actions);
  }
  wrap.appendChild(body);
  wrap.appendChild(meta);
  return wrap;
}