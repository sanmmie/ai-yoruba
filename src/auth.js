/**
 * src/auth.js
 * Production Authentication Controller v2
 *
 * Security:
 *  - Client-side login rate limiting: 5 failures → 30 s lockout
 *  - No browser prompt()/confirm() — Modal module only
 *  - Stable auth state guard (prevUid) prevents duplicate initializeChat calls
 *  - Social sign-in via signInWithPopup
 *  - Subscription status listener mounted/torn-down with auth lifecycle
 */

import {
  GoogleAuthProvider, GithubAuthProvider,
  signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendEmailVerification,
  updateProfile, signOut as fbSignOut,
  onAuthStateChanged, reload,
} from 'firebase/auth';

import { auth }                        from './firebase-config.js';
import { initializeChat, teardownChat } from './app.js';
import { subscribeToSubscription }      from './modules/paymentService.js';
import { logger }                       from './utils/logger.js';

const $ = id => document.getElementById(id);

// ── Providers ────────────────────────────────────────────────
const gProvider = new GoogleAuthProvider();
gProvider.setCustomParameters({ prompt: 'select_account' });
const ghProvider = new GithubAuthProvider();

// ── Rate limiting ─────────────────────────────────────────────
const RL = { count: 0, lockedUntil: 0 };
function checkRL() {
  const now = Date.now();
  if (now < RL.lockedUntil) throw new Error(`Ọ̀pọ̀ ìgbìyànjú. Dúró ìsẹ́jú ${Math.ceil((RL.lockedUntil-now)/1000)} kí o gbìyànjú lẹ́ẹ̀kan sí i.`);
  if (RL.count >= 5) { RL.lockedUntil = now + 30000; RL.count = 0; throw new Error('Ọ̀pọ̀ ìgbìyànjú. Dúró ìsẹ́jú 30 kí o gbìyànjú lẹ́ẹ̀kan sí i.'); }
}
const failRL  = () => { RL.count++; };
const resetRL = () => { RL.count = 0; RL.lockedUntil = 0; };

// ── State ─────────────────────────────────────────────────────
let isInit = false, prevUid = null, unsubSub = null;

// ── Helpers ───────────────────────────────────────────────────
function showView(id) {
  ['view-login','view-signup','view-verify'].forEach(v => {
    const el = $(v); if (el) el.classList.toggle('active', v === `view-${id}`);
  });
}
function showAuthGate(view = 'login') {
  const g = $('auth-gate'), a = $('app-root');
  if (g) { g.hidden = false; g.dataset.state = ''; }
  if (a) a.hidden = true;
  showView(view);
}
async function revealApp(user) {
  if (isInit) return; isInit = true;
  const gate = $('auth-gate');
  try {
    ['view-login','view-signup','view-verify'].forEach(v => $(v)?.classList.remove('active'));
    if (gate) gate.dataset.state = 'loading';
    updateUserMenu(user);
    mountSubWatcher(user.uid);
    await initializeChat(user);
    if (gate) { gate.dataset.state = ''; gate.hidden = true; }
    const app = $('app-root'); if (app) app.hidden = false;
    logger.info('App revealed', { uid: user.uid });
  } catch (err) {
    logger.error('revealApp failed', err);
    if (gate) gate.dataset.state = '';
    showView('login');
    showErr($('login-error'), 'Kò lè bẹ̀rẹ̀ app. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.');
  } finally { isInit = false; }
}
function mountSubWatcher(uid) {
  unsubSub?.();
  unsubSub = subscribeToSubscription(uid, ({ plan }) => {
    const badge = $('user-plan-badge'), upBtn = $('upgrade-btn'), cta = $('sidebar-upgrade-cta');
    if (badge) { badge.textContent = plan === 'premium' ? '✦ Premium' : 'Ọfẹ̀'; badge.classList.toggle('badge--premium', plan === 'premium'); }
    if (upBtn) upBtn.hidden = plan === 'premium';
    if (cta)   cta.hidden   = plan === 'premium';
  });
}
function showErr(el, msg) { if (!el || !msg) return; el.textContent = msg; el.classList.add('visible'); }
function clearErr(el)     { if (!el) return; el.textContent = ''; el.classList.remove('visible'); }
function setLoading(btn, on, txt = 'Ń dúró...') {
  if (!btn) return; btn.disabled = on;
  if (on)  { btn.dataset.orig = btn.textContent; btn.textContent = txt; }
  else     { btn.textContent = btn.dataset.orig ?? btn.textContent; delete btn.dataset.orig; }
}
const ERRORS = {
  'auth/invalid-email':                            'Àdírẹ́sì ìmẹ̀lẹ̀ yìí kò tọ́.',
  'auth/user-not-found':                           'Kò sí àkáǹtì pẹ̀lú ìmẹ̀lẹ̀ yìí.',
  'auth/wrong-password':                           'Ọ̀rọ̀ àṣírí kò tọ́.',
  'auth/invalid-credential':                       'Ìmẹ̀lẹ̀ tàbí ọ̀rọ̀ àṣírí kò tọ́.',
  'auth/email-already-in-use':                     'Àkáǹtì pẹ̀lú ìmẹ̀lẹ̀ yìí ti wà tẹ́lẹ̀.',
  'auth/weak-password':                            'Ọ̀rọ̀ àṣírí gbọdọ̀ ní 6+ ìwé.',
  'auth/popup-closed-by-user':                     '',
  'auth/cancelled-popup-request':                  '',
  'auth/account-exists-with-different-credential': 'Àkáǹtì yìí ti ní ọ̀nà wọlé míràn.',
  'auth/network-request-failed':                   'Àṣìṣe nẹ́tíwọ́ọ̀kì. Ṣàyẹ̀wò ìsopọ̀ rẹ.',
  'auth/too-many-requests':                        'Ọ̀pọ̀ ìgbìyànjú. Dúró kekere kí o gbìyànjú lẹ́ẹ̀kan sí i.',
  'auth/user-disabled':                            'Àkáǹtì yìí ti dá dúró.',
};
const yorubaErr = code => ERRORS[code] ?? 'Àṣìṣe kan ṣẹlẹ̀. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.';

function updateUserMenu(user) {
  const name = user.displayName || user.email?.split('@')[0] || 'User';
  const init = encodeURIComponent(name.slice(0,2).toUpperCase());
  const n = $('user-name'), e = $('user-email-display'), a = $('user-avatar');
  if (n) n.textContent = name;
  if (e) e.textContent = user.email ?? '';
  if (a) { a.src = user.photoURL || `https://ui-avatars.com/api/?name=${init}&background=2A5C3E&color=C9A84C&size=64&bold=true`; a.alt = name; }
}

// ── Auth state observer ───────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) {
    if (prevUid) { unsubSub?.(); unsubSub = null; teardownChat(); prevUid = null; }
    showAuthGate('login'); return;
  }
  if (!user.emailVerified) {
    prevUid = null;
    const d = $('verify-email-display'); if (d) d.textContent = user.email ?? '';
    showAuthGate('verify'); return;
  }
  if (prevUid !== user.uid) { prevUid = user.uid; await revealApp(user); }
});

// ── Login ─────────────────────────────────────────────────────
$('login-form')?.addEventListener('submit', async e => {
  e.preventDefault(); clearErr($('login-error'));
  try { checkRL(); } catch (err) { showErr($('login-error'), err.message); return; }
  const email = $('login-email')?.value.trim(), pwd = $('login-password')?.value;
  if (!email || !pwd) { showErr($('login-error'), 'Jọ̀wọ́ tẹ ìmẹ̀lẹ̀ àti ọ̀rọ̀ àṣírí rẹ.'); return; }
  setLoading($('login-btn'), true, 'Ń wọlé...');
  try { await signInWithEmailAndPassword(auth, email, pwd); resetRL(); }
  catch (err) { failRL(); logger.warn('Login failed', err, { email }); const m = yorubaErr(err.code); if (m) showErr($('login-error'), m); setLoading($('login-btn'), false); }
});

// ── Sign-up ───────────────────────────────────────────────────
$('signup-form')?.addEventListener('submit', async e => {
  e.preventDefault(); clearErr($('signup-error'));
  const name = $('signup-name')?.value.trim(), email = $('signup-email')?.value.trim(), pwd = $('signup-password')?.value;
  if (!name || !email || !pwd) { showErr($('signup-error'), 'Jọ̀wọ́ pari gbogbo àwọn aaye.'); return; }
  if (pwd.length < 8) { showErr($('signup-error'), 'Ọ̀rọ̀ àṣírí gbọdọ̀ ní 8+ ìwé.'); return; }
  setLoading($('signup-btn'), true, 'Ń ṣẹ̀dá àkáǹtì...');
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pwd);
    await updateProfile(cred.user, { displayName: name });
    await sendEmailVerification(cred.user);
    logger.info('User registered', { uid: cred.user.uid });
  } catch (err) { logger.warn('Signup failed', err, { email }); const m = yorubaErr(err.code); if (m) showErr($('signup-error'), m); setLoading($('signup-btn'), false); }
});

// ── Social ────────────────────────────────────────────────────
async function social(provider, errEl) {
  clearErr(errEl);
  try { await signInWithPopup(auth, provider); resetRL(); }
  catch (err) { logger.warn('Social sign-in failed', err); const m = yorubaErr(err.code); if (m) showErr(errEl, m); }
}
$('google-signin-btn')?.addEventListener('click', () => social(gProvider,  $('login-error')));
$('github-signin-btn')?.addEventListener('click', () => social(ghProvider, $('login-error')));
$('google-signup-btn')?.addEventListener('click', () => social(gProvider,  $('signup-error')));
$('github-signup-btn')?.addEventListener('click', () => social(ghProvider, $('signup-error')));

// ── Email verification ────────────────────────────────────────
$('resend-verify-btn')?.addEventListener('click', async () => {
  const user = auth.currentUser; if (!user) return;
  const btn = $('resend-verify-btn'); setLoading(btn, true, 'Ń rànsẹ́...'); clearErr($('verify-error'));
  try {
    await sendEmailVerification(user);
    if (btn) btn.textContent = 'A ti fi ìmẹ̀lẹ̀ ránsẹ́ ✓';
    setTimeout(() => { if (btn) { btn.textContent = 'Tún Ìmẹ̀lẹ̀ Ránsẹ́'; delete btn.dataset.orig; } }, 5000);
  } catch { showErr($('verify-error'), 'Kò lè rànsẹ́. Gbìyànjú lẹ́ẹ̀kan sí i.'); setLoading(btn, false); }
});

$('check-verify-btn')?.addEventListener('click', async () => {
  const user = auth.currentUser; if (!user) return;
  const btn = $('check-verify-btn'); setLoading(btn, true, 'Ń ṣàyẹ̀wò...'); clearErr($('verify-error'));
  try {
    await reload(user);
    if (!user.emailVerified) { setLoading(btn, false); showErr($('verify-error'), 'Ìmẹ̀lẹ̀ kò tíì ṣàyẹ̀wò.'); }
  } catch { setLoading(btn, false); showErr($('verify-error'), 'Àṣìṣe kan ṣẹlẹ̀. Gbìyànjú lẹ́ẹ̀kan sí i.'); }
});

$('verify-signout-btn')?.addEventListener('click', () => fbSignOut(auth));

// ── View switches ─────────────────────────────────────────────
$('go-signup')?.addEventListener('click', e => { e.preventDefault(); clearErr($('login-error'));  showView('signup'); });
$('go-login')?.addEventListener('click',  e => { e.preventDefault(); clearErr($('signup-error')); showView('login');  });

// ── User menu ─────────────────────────────────────────────────
$('user-menu-btn')?.addEventListener('click', e => {
  e.stopPropagation();
  const dd = $('user-dropdown'); if (dd) dd.hidden = !dd.hidden;
  $('user-menu-btn')?.setAttribute('aria-expanded', String(!$('user-dropdown')?.hidden));
});
document.addEventListener('click', () => { const dd = $('user-dropdown'); if (dd) dd.hidden = true; });

$('signout-btn')?.addEventListener('click', async () => {
  const dd = $('user-dropdown'); if (dd) dd.hidden = true;
  unsubSub?.(); unsubSub = null;
  await fbSignOut(auth);
  const em = $('login-email'), pw = $('login-password');
  if (em) em.value = ''; if (pw) pw.value = '';
  clearErr($('login-error')); resetRL();
});
