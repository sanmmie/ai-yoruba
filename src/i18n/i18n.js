/**
 * src/i18n/i18n.js
 *
 * Tiny i18n loader.  Reads src/i18n/{locale}.json, persists the choice in
 * localStorage and falls back to English for any missing key.  Yoruba
 * strings are PENDING TRANSLATION — see src/i18n/yo.json and
 * docs/YORUBA_COPY_REVIEW.md.
 */
const CACHE = {};
const SUPPORTED = ['en', 'yo'];
const STORAGE_KEY = 'ygpt_locale';

let current = 'en';

function persist(locale) {
  current = locale;
  try { localStorage.setItem(STORAGE_KEY, locale); } catch {}
}

export function getLocale() {
  return current;
}

export async function loadLocale(locale) {
  if (!SUPPORTED.includes(locale)) locale = 'en';
  if (CACHE[locale]) { persist(locale); return CACHE[locale]; }
  try {
    const res = await fetch(`/src/i18n/${locale}.json`);
    if (!res.ok) throw new Error(`i18n fetch failed for ${locale}`);
    CACHE[locale] = await res.json();
  } catch (e) {
    console.warn('[i18n] failed to load', locale, e);
    CACHE[locale] = {};
  }
  persist(locale);
  return CACHE[locale];
}

export async function initI18n() {
  let saved = 'en';
  try { saved = localStorage.getItem(STORAGE_KEY) || 'en'; } catch {}
  // Honour prefers for Yoruba speakers when no explicit choice is stored.
  if (saved === 'en') {
    try {
      const nav = navigator.language || navigator.userLanguage || '';
      if (nav.toLowerCase().startsWith('yo')) saved = 'yo';
    } catch {}
  }
  await loadLocale(saved);
  return current;
}

export function t(keyPath, fallback = '') {
  const parts = keyPath.split('.');
  let node = CACHE[current] || {};
  for (const p of parts) {
    if (node === null || typeof node !== 'object') { node = null; break; }
    node = node[p];
  }
  if (node === null) {
    const en = CACHE['en'] || {};
    let n = en;
    for (const p of parts) { if (n === null || typeof n !== 'object') { n = null; break; } n = n[p]; }
    node = n;
  }
  return typeof node === 'string' ? node : fallback;
}

export function setLocale(locale, { reload = false } = {}) {
  if (!SUPPORTED.includes(locale)) return;
  persist(locale);
  if (reload) document.location.reload();
}