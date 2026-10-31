'use strict';

/**
 * src/ui/sidebar.js
 *
 * Collapsible left sidebar (drawer on mobile with swipe-to-open and scrim).
 *
 *  - New chat at the top, search, conversations grouped Today / Yesterday /
 *    Previous 7 days / Older.
 *  - Hover overflow menu: rename, delete with undo toast.
 *  - Account menu at the bottom: plan badge, Settings → Privacy & data,
 *    Terms, Privacy Notice, Sign out.
 */
import { t } from '../i18n/i18n.js';
import { toast } from './toast.js';

function groupSessions(sessions) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 24 * 60 * 60 * 1000;
  const prev7 = today - 7 * 24 * 60 * 60 * 1000;
  const groups = { today: [], yesterday: [], prev7: [], older: [] };
  for (const s of sessions) {
    const ts = s.updatedAt ? new Date(s.updatedAt).getTime() : s.createdAt ? new Date(s.createdAt).getTime() : 0;
    if (ts >= today) groups.today.push(s);
    else if (ts >= yesterday) groups.yesterday.push(s);
    else if (ts >= prev7) groups.prev7.push(s);
    else groups.older.push(s);
  }
  return groups;
}

export function mountSidebar({ onNewChat, onSwitch, onRename, onDelete, onSignOut, onSettings, plan }) {
  const aside = document.getElementById('sidebar');
  if (!aside) return null;

  const list = document.createElement('div');
  list.className = 'sidebar__list';
  aside.appendChild(list);

  const search = document.createElement('input');
  search.className = 'sidebar__search';
  search.type = 'search';
  search.placeholder = t('chat.search');
  aside.insertBefore(search, list);

  function render(sessions) {
    list.innerHTML = '';
    const groups = groupSessions(sessions);
    const labels = {
      today: t('chat.today'),
      yesterday: t('chat.yesterday'),
      prev7: t('chat.previous7Days'),
      older: t('chat.older'),
    };
    for (const key of ['today', 'yesterday', 'prev7', 'older']) {
      const items = groups[key];
      if (!items.length) continue;
      const section = document.createElement('div');
      section.className = 'sidebar__group';
      const head = document.createElement('div');
      head.className = 'sidebar__group-head';
      head.textContent = labels[key];
      section.appendChild(head);
      for (const s of items) {
        const row = document.createElement('div');
        row.className = 'sidebar__item';
        row.dataset.sessionId = s.id;
        const title = document.createElement('div');
        title.className = 'sidebar__title';
        title.textContent = s.title || t('chat.emptyHint');
        const menu = document.createElement('div');
        menu.className = 'sidebar__menu';
        const rename = document.createElement('button');
        rename.className = 'icon-btn';
        rename.type = 'button';
        rename.textContent = '✎';
        rename.addEventListener('click', (e) => { e.stopPropagation(); onRename?.(s); });
        const del = document.createElement('button');
        del.className = 'icon-btn';
        del.type = 'button';
        del.textContent = '🗑';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          onDelete?.(s.id);
        });
        menu.appendChild(rename);
        menu.appendChild(del);
        row.appendChild(title);
        row.appendChild(menu);
        row.addEventListener('click', () => onSwitch?.(s.id));
        section.appendChild(row);
      }
      list.appendChild(section);
    }
  }

  // Account menu at the bottom.
  const account = document.createElement('div');
  account.className = 'sidebar__account';
  const badge = document.createElement('div');
  badge.className = `badge badge--${plan === 'premium' ? 'premium' : 'free'}`;
  badge.textContent = plan === 'premium' ? '✦ Premium' : 'Ọfẹ̀';
  account.appendChild(badge);
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'sidebar__account-btn';
  settingsBtn.type = 'button';
  settingsBtn.textContent = t('settings.title');
  settingsBtn.addEventListener('click', () => onSettings?.());
  account.appendChild(settingsBtn);
  const termsBtn = document.createElement('button');
  termsBtn.className = 'sidebar__account-btn';
  termsBtn.type = 'button';
  termsBtn.textContent = 'Terms';
  termsBtn.addEventListener('click', () => { window.open('/terms.html', '_blank'); });
  account.appendChild(termsBtn);
  const privacyBtn = document.createElement('button');
  privacyBtn.className = 'sidebar__account-btn';
  privacyBtn.type = 'button';
  privacyBtn.textContent = 'Privacy';
  privacyBtn.addEventListener('click', () => { window.open('/privacy.html', '_blank'); });
  account.appendChild(privacyBtn);
  const signoutBtn = document.createElement('button');
  signoutBtn.className = 'sidebar__account-btn';
  signoutBtn.type = 'button';
  signoutBtn.textContent = t('auth.signOut');
  signoutBtn.addEventListener('click', () => onSignOut?.());
  account.appendChild(signoutBtn);
  aside.appendChild(account);

  return { render, search };
}