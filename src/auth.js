
/**
 * src/auth.js
 * Production Authentication Controller v3
 *
 * Security and reliability:
 *  - Client-side login rate limiting
 *  - No browser prompt()/confirm()
 *  - Firebase auth state lifecycle management
 *  - Retryable consent verification
 *  - Single-flight authentication initialization
 *  - Google and GitHub popup authentication
 *  - Email verification
 *  - Subscription listener lifecycle management
 *  - Recoverable application initialization failures
 */

import {
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  signOut as fbSignOut,
  onAuthStateChanged,
  reload,
} from 'firebase/auth';

import { auth } from './firebase-config.js';
import { initializeChat, teardownChat } from './app.js';
import { subscribeToSubscription } from './modules/paymentService.js';
import { logger } from './utils/logger.js';
import {
  mountConsentGate,
  ensureConsented,
} from './ui/consent.js';

const $ = id => document.getElementById(id);

// ─────────────────────────────────────────────────────────────
// PROVIDERS
// ─────────────────────────────────────────────────────────────

const gProvider = new GoogleAuthProvider();

gProvider.setCustomParameters({
  prompt: 'select_account',
});

const ghProvider = new GithubAuthProvider();

ghProvider.addScope('user:email');

// ─────────────────────────────────────────────────────────────
// RATE LIMITING
// ─────────────────────────────────────────────────────────────

const RL = {
  count: 0,
  lockedUntil: 0,
};

function checkRL() {
  const now = Date.now();

  if (now < RL.lockedUntil) {
    throw new Error(
      `Ọ̀pọ̀ ìgbìyànjú. Dúró ìsẹ́jú ${
        Math.ceil((RL.lockedUntil - now) / 1000)
      } kí o gbìyànjú lẹ́ẹ̀kan sí i.`
    );
  }

  if (RL.count >= 5) {
    RL.lockedUntil = now + 30000;
    RL.count = 0;

    throw new Error(
      'Ọ̀pọ̀ ìgbìyànjú. Dúró ìsẹ́jú 30 kí o gbìyànjú lẹ́ẹ̀kan sí i.'
    );
  }
}

const failRL = () => {
  RL.count++;
};

const resetRL = () => {
  RL.count = 0;
  RL.lockedUntil = 0;
};

// ─────────────────────────────────────────────────────────────
// AUTHENTICATION STATE
// ─────────────────────────────────────────────────────────────

let isInit = false;
let prevUid = null;
let pendingConsentUid = null;

let unsubSub = null;
let socialSignInInProgress = false;
let authFlowInProgress = false;

// ─────────────────────────────────────────────────────────────
// VIEW HELPERS
// ─────────────────────────────────────────────────────────────

function showView(id) {
  [
    'view-login',
    'view-signup',
    'view-verify',
  ].forEach(view => {
    const el = $(view);

    if (el) {
      el.classList.toggle(
        'active',
        view === `view-${id}`
      );
    }
  });
}

function showAuthGate(view = 'login') {
  const gate = $('auth-gate');
  const app = $('app-root');
  const consent = $('consent-gate');

  if (gate) {
    gate.hidden = false;
    gate.dataset.state = '';
  }

  if (app) {
    app.hidden = true;
  }

  if (consent) {
    consent.hidden = true;
  }

  showView(view);
}

function showConsentState() {
  const authGate = $('auth-gate');
  const app = $('app-root');

  if (authGate) {
    authGate.hidden = true;
  }

  if (app) {
    app.hidden = true;
  }
}

// ─────────────────────────────────────────────────────────────
// ERROR HELPERS
// ─────────────────────────────────────────────────────────────

function showErr(el, msg) {
  if (!el || !msg) return;

  el.textContent = msg;
  el.classList.add('visible');
}

function clearErr(el) {
  if (!el) return;

  el.textContent = '';
  el.classList.remove('visible');
}

function setLoading(btn, on, txt = 'Ń dúró...') {
  if (!btn) return;

  btn.disabled = on;

  if (on) {
    btn.dataset.orig = btn.textContent;
    btn.textContent = txt;
  } else {
    btn.textContent =
      btn.dataset.orig ?? btn.textContent;

    delete btn.dataset.orig;
  }
}

// ─────────────────────────────────────────────────────────────
// FIREBASE ERROR TRANSLATIONS
// ─────────────────────────────────────────────────────────────

const ERRORS = {
  'auth/invalid-email':
    'Àdírẹ́sì ìmẹ̀lẹ̀ yìí kò tọ́.',

  'auth/user-not-found':
    'Kò sí àkáǹtì pẹ̀lú ìmẹ̀lẹ̀ yìí.',

  'auth/wrong-password':
    'Ọ̀rọ̀ àṣírí kò tọ́.',

  'auth/invalid-credential':
    'Ìmẹ̀lẹ̀ tàbí ọ̀rọ̀ àṣírí kò tọ́.',

  'auth/email-already-in-use':
    'Àkáǹtì pẹ̀lú ìmẹ̀lẹ̀ yìí ti wà tẹ́lẹ̀.',

  'auth/weak-password':
    'Ọ̀rọ̀ àṣírí gbọdọ̀ ní 8+ ìwé.',

  'auth/operation-not-allowed':
    'Ọ̀nà wọlé yìí kò tíì ṣiṣẹ́. Jọ̀wọ́ bá olùdarí sọ̀rọ̀.',

  'auth/unauthorized-domain':
    'Ojú-òpó yìí kò sí lára àwọn domain tí Firebase gba. Jọ̀wọ́ fi sí Firebase Authentication settings.',

  'auth/popup-blocked':
    'Ẹ̀rọ aṣàwárí dí popup náà. Jọ̀wọ́ gba popup láàyè kí o tún gbìyànjú.',

  'auth/web-storage-unsupported':
    'Ẹ̀rọ aṣàwárí kò gba ìtọ́jú data tó yẹ fún ìwọlé. Jọ̀wọ́ tan cookies àti storage sí.',

  'auth/popup-closed-by-user':
    '',

  'auth/cancelled-popup-request':
    '',

  'auth/account-exists-with-different-credential':
    'Àkáǹtì yìí ti wà pẹ̀lú ọ̀nà wọlé míràn. Wọlé pẹ̀lú ọ̀nà àkọ́kọ́ tí o lò.',

  'auth/credential-already-in-use':
    'Ìdánimọ̀ yìí ti so mọ́ àkáǹtì míràn.',

  'auth/network-request-failed':
    'Àṣìṣe nẹ́tíwọ́ọ̀kì. Ṣàyẹ̀wò ìsopọ̀ rẹ.',

  'auth/too-many-requests':
    'Ọ̀pọ̀ ìgbìyànjú. Dúró kekere kí o gbìyànjú lẹ́ẹ̀kan sí i.',

  'auth/user-disabled':
    'Àkáǹtì yìí ti dá dúró.',
};

function yorubaErr(code) {
  return (
    ERRORS[code] ??
    'Àṣìṣe kan ṣẹlẹ̀. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.'
  );
}

// ─────────────────────────────────────────────────────────────
// USER PROFILE
// ─────────────────────────────────────────────────────────────

function updateUserMenu(user) {
  const name =
    user.displayName ||
    user.email?.split('@')[0] ||
    'User';

  const initials = encodeURIComponent(
    name.slice(0, 2).toUpperCase()
  );

  const nameEl = $('user-name');
  const emailEl = $('user-email-display');
  const avatarEl = $('user-avatar');

  if (nameEl) {
    nameEl.textContent = name;
  }

  if (emailEl) {
    emailEl.textContent = user.email ?? '';
  }

  if (avatarEl) {
    avatarEl.src =
      user.photoURL ||
      `https://ui-avatars.com/api/?name=${initials}&background=2A5C3E&color=C9A84C&size=64&bold=true`;

    avatarEl.alt = name;
  }
}

// ─────────────────────────────────────────────────────────────
// FEDERATED USER DETECTION
// ─────────────────────────────────────────────────────────────

function isFederatedUser(user) {
  return user.providerData.some(({ providerId }) =>
    providerId === GoogleAuthProvider.PROVIDER_ID ||
    providerId === GithubAuthProvider.PROVIDER_ID
  );
}

// ─────────────────────────────────────────────────────────────
// SUBSCRIPTION WATCHER
// ─────────────────────────────────────────────────────────────

function mountSubWatcher(uid) {
  unsubSub?.();
  unsubSub = null;

  unsubSub = subscribeToSubscription(
    uid,
    ({ plan }) => {
      const badge = $('user-plan-badge');
      const upgradeBtn = $('upgrade-btn');
      const cta = $('sidebar-upgrade-cta');

      const premium = plan === 'premium';

      if (badge) {
        badge.textContent = premium
          ? '✦ Premium'
          : 'Ọfẹ̀';

        badge.classList.toggle(
          'badge--premium',
          premium
        );
      }

      if (upgradeBtn) {
        upgradeBtn.hidden = premium;
      }

      if (cta) {
        cta.hidden = premium;
      }
    }
  );
}

function stopSubWatcher() {
  if (typeof unsubSub === 'function') {
    unsubSub();
  }

  unsubSub = null;
}

// ─────────────────────────────────────────────────────────────
// APPLICATION INITIALIZATION
// ─────────────────────────────────────────────────────────────

async function revealApp(user) {
  if (!user) {
    throw new Error('Cannot initialize app without a user.');
  }

  if (isInit) {
    return;
  }

  isInit = true;

  const authGate = $('auth-gate');
  const consentGate = $('consent-gate');

  try {
    [
      'view-login',
      'view-signup',
      'view-verify',
    ].forEach(view => {
      $(view)?.classList.remove('active');
    });

    if (authGate) {
      authGate.dataset.state = 'loading';
    }

    updateUserMenu(user);

    // Initialize the chat before declaring success.
    await initializeChat(user);

    // Mount subscription monitoring only after chat succeeds.
    mountSubWatcher(user.uid);

    if (authGate) {
      authGate.dataset.state = '';
      authGate.hidden = true;
    }

    if (consentGate) {
      consentGate.hidden = true;
    }

    const app = $('app-root');

    if (app) {
      app.hidden = false;
    }

    prevUid = user.uid;
    pendingConsentUid = null;

    logger.info('App revealed', {
      uid: user.uid,
    });

  } catch (err) {
    logger.error('revealApp failed', err);

    stopSubWatcher();

    prevUid = null;

    if (authGate) {
      authGate.dataset.state = '';
    }

    // If consent is still visible, keep it visible.
    // Otherwise return to the authentication interface.
    if (!consentGate || consentGate.hidden) {
      showAuthGate('login');

      showErr(
        $('login-error'),
        'Kò lè bẹ̀rẹ̀ app. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.'
      );
    }

    throw err;

  } finally {
    isInit = false;
  }
}

// ─────────────────────────────────────────────────────────────
// CONSENT AND AUTHENTICATION FLOW
// ─────────────────────────────────────────────────────────────

async function handleAuthState(user) {
  if (!user) {
    stopSubWatcher();

    if (prevUid || pendingConsentUid) {
      teardownChat();
    }

    prevUid = null;
    pendingConsentUid = null;

    showAuthGate('login');

    return;
  }

  // Email/password accounts must verify their email first.
  if (
    !user.emailVerified &&
    !isFederatedUser(user)
  ) {
    prevUid = null;
    pendingConsentUid = null;

    const display = $('verify-email-display');

    if (display) {
      display.textContent = user.email ?? '';
    }

    showAuthGate('verify');

    return;
  }

  // Already initialized.
  if (prevUid === user.uid) {
    return;
  }

  // Consent screen already waiting for this user.
  if (pendingConsentUid === user.uid) {
    return;
  }

  // Prevent overlapping initialization.
  if (authFlowInProgress) {
    return;
  }

  authFlowInProgress = true;

  try {
    const consented = await ensureConsented();

    if (!consented) {
      pendingConsentUid = user.uid;

      showConsentState();

      mountConsentGate(async () => {
        // The consent module invokes this callback after
        // successful backend verification.
        await revealApp(user);
      });

      return;
    }

    await revealApp(user);

  } catch (err) {
    logger.error(
      'Authentication initialization failed',
      err
    );

    prevUid = null;

    // Do not sign the user out because a temporary
    // consent-service or initialization error occurred.
    const consentGate = $('consent-gate');

    if (!consentGate || consentGate.hidden) {
      showAuthGate('login');

      showErr(
        $('login-error'),
        'A kò lè parí ìwọlé rẹ. Ṣàyẹ̀wò nẹ́tíwọ́ọ̀kì rẹ kí o tún gbìyànjú.'
      );
    }

  } finally {
    authFlowInProgress = false;
  }
}

// ─────────────────────────────────────────────────────────────
// AUTH STATE OBSERVER
// ─────────────────────────────────────────────────────────────

onAuthStateChanged(auth, user => {
  handleAuthState(user).catch(err => {
    logger.error('Unhandled auth observer error', err);

    prevUid = null;
    authFlowInProgress = false;

    showAuthGate('login');

    showErr(
      $('login-error'),
      'Àṣìṣe kan ṣẹlẹ̀ nígbà ìwọlé. Jọ̀wọ́ tún gbìyànjú.'
    );
  });
});

// ─────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────

$('login-form')?.addEventListener('submit', async e => {
  e.preventDefault();

  clearErr($('login-error'));

  // If Firebase already has an authenticated user,
  // retry initialization instead of signing in again.
  if (auth.currentUser) {
    await handleAuthState(auth.currentUser);
    return;
  }

  try {
    checkRL();
  } catch (err) {
    showErr($('login-error'), err.message);
    return;
  }

  const email = $('login-email')?.value.trim();
  const password = $('login-password')?.value;

  if (!email || !password) {
    showErr(
      $('login-error'),
      'Jọ̀wọ́ tẹ ìmẹ̀lẹ̀ àti ọ̀rọ̀ àṣírí rẹ.'
    );

    return;
  }

  setLoading(
    $('login-btn'),
    true,
    'Ń wọlé...'
  );

  try {
    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    resetRL();

  } catch (err) {
    failRL();

    logger.warn('Login failed', err, { email });

    const message = yorubaErr(err.code);

    if (message) {
      showErr($('login-error'), message);
    }

  } finally {
    setLoading($('login-btn'), false);
  }
});

// ─────────────────────────────────────────────────────────────
// SIGN-UP
// ─────────────────────────────────────────────────────────────

$('signup-form')?.addEventListener('submit', async e => {
  e.preventDefault();

  clearErr($('signup-error'));

  const name = $('signup-name')?.value.trim();
  const email = $('signup-email')?.value.trim();
  const password = $('signup-password')?.value;

  if (!name || !email || !password) {
    showErr(
      $('signup-error'),
      'Jọ̀wọ́ pari gbogbo àwọn aaye.'
    );

    return;
  }

  if (password.length < 8) {
    showErr(
      $('signup-error'),
      'Ọ̀rọ̀ àṣírí gbọdọ̀ ní 8+ ìwé.'
    );

    return;
  }

  setLoading(
    $('signup-btn'),
    true,
    'Ń ṣẹ̀dá àkáǹtì...'
  );

  let accountCreated = false;

  try {
    const credential =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    accountCreated = true;

    await updateProfile(credential.user, {
      displayName: name,
    });

    await sendEmailVerification(credential.user);

    logger.info('User registered', {
      uid: credential.user.uid,
    });

  } catch (err) {
    logger.warn('Signup failed', err, {
      email,
      accountCreated,
    });

    if (accountCreated) {
      showAuthGate('verify');

      showErr(
        $('verify-error'),
        yorubaErr(err.code)
      );

    } else {
      showErr(
        $('signup-error'),
        yorubaErr(err.code)
      );
    }

  } finally {
    setLoading($('signup-btn'), false);
  }
});

// ─────────────────────────────────────────────────────────────
// SOCIAL SIGN-IN
// ─────────────────────────────────────────────────────────────

async function social(provider, errEl, btn) {
  if (socialSignInInProgress) {
    return;
  }

  clearErr(errEl);

  // Retry an existing Firebase session rather than
  // opening another popup after a previous failed flow.
  if (auth.currentUser) {
    await handleAuthState(auth.currentUser);
    return;
  }

  socialSignInInProgress = true;

  document.querySelectorAll('.social-btn').forEach(button => {
    button.disabled = true;
  });

  btn?.setAttribute('aria-busy', 'true');

  try {
    // Keep this directly in the user click flow.
    await signInWithPopup(auth, provider);

    resetRL();

  } catch (err) {
    logger.warn('Social sign-in failed', err, {
      provider: provider.providerId,
    });

    const message = yorubaErr(err.code);

    if (message) {
      showErr(errEl, message);
    }

  } finally {
    btn?.removeAttribute('aria-busy');

    document.querySelectorAll('.social-btn').forEach(button => {
      button.disabled = false;
    });

    socialSignInInProgress = false;
  }
}

$('google-signin-btn')?.addEventListener('click', e =>
  social(
    gProvider,
    $('login-error'),
    e.currentTarget
  )
);

$('github-signin-btn')?.addEventListener('click', e =>
  social(
    ghProvider,
    $('login-error'),
    e.currentTarget
  )
);

$('google-signup-btn')?.addEventListener('click', e =>
  social(
    gProvider,
    $('signup-error'),
    e.currentTarget
  )
);

$('github-signup-btn')?.addEventListener('click', e =>
  social(
    ghProvider,
    $('signup-error'),
    e.currentTarget
  )
);

// ─────────────────────────────────────────────────────────────
// EMAIL VERIFICATION
// ─────────────────────────────────────────────────────────────

$('resend-verify-btn')?.addEventListener(
  'click',
  async () => {
    const user = auth.currentUser;

    if (!user) return;

    const btn = $('resend-verify-btn');

    setLoading(btn, true, 'Ń rànsẹ́...');

    clearErr($('verify-error'));

    try {
      await sendEmailVerification(user);

      setLoading(btn, false);

      if (btn) {
        btn.textContent = 'A ti fi ìmẹ̀lẹ̀ ránsẹ́ ✓';
      }

      setTimeout(() => {
        if (btn) {
          btn.textContent = 'Tún Ìmẹ̀lẹ̀ Ránsẹ́';
        }
      }, 5000);

    } catch (err) {
      logger.warn(
        'Verification email resend failed',
        err
      );

      showErr(
        $('verify-error'),
        yorubaErr(err.code)
      );

      setLoading(btn, false);
    }
  }
);

$('check-verify-btn')?.addEventListener(
  'click',
  async () => {
    const user = auth.currentUser;

    if (!user) return;

    const btn = $('check-verify-btn');

    setLoading(btn, true, 'Ń ṣàyẹ̀wò...');

    clearErr($('verify-error'));

    try {
      await reload(user);

      if (!auth.currentUser?.emailVerified) {
        setLoading(btn, false);

        showErr(
          $('verify-error'),
          'Ìmẹ̀lẹ̀ kò tíì ṣàyẹ̀wò.'
        );

        return;
      }

      await handleAuthState(auth.currentUser);

    } catch (err) {
      logger.warn(
        'Email verification check failed',
        err
      );

      showErr(
        $('verify-error'),
        yorubaErr(err.code)
      );

    } finally {
      setLoading(btn, false);
    }
  }
);

$('verify-signout-btn')?.addEventListener(
  'click',
  () => fbSignOut(auth)
);

// ─────────────────────────────────────────────────────────────
// VIEW SWITCHES
// ─────────────────────────────────────────────────────────────

$('go-signup')?.addEventListener('click', e => {
  e.preventDefault();

  clearErr($('login-error'));

  showView('signup');
});

$('go-login')?.addEventListener('click', e => {
  e.preventDefault();

  clearErr($('signup-error'));

  showView('login');
});

// ─────────────────────────────────────────────────────────────
// USER MENU
// ─────────────────────────────────────────────────────────────

$('user-menu-btn')?.addEventListener('click', e => {
  e.stopPropagation();

  const dropdown = $('user-dropdown');

  if (dropdown) {
    dropdown.hidden = !dropdown.hidden;
  }

  $('user-menu-btn')?.setAttribute(
    'aria-expanded',
    String(!dropdown?.hidden)
  );
});

document.addEventListener('click', () => {
  const dropdown = $('user-dropdown');

  if (dropdown) {
    dropdown.hidden = true;
  }
});

// ─────────────────────────────────────────────────────────────
// SIGN-OUT
// ─────────────────────────────────────────────────────────────

$('signout-btn')?.addEventListener(
  'click',
  async () => {
    const dropdown = $('user-dropdown');

    if (dropdown) {
      dropdown.hidden = true;
    }

    stopSubWatcher();

    prevUid = null;
    pendingConsentUid = null;

    const email = $('login-email');
    const password = $('login-password');

    if (email) email.value = '';
    if (password) password.value = '';

    clearErr($('login-error'));

    resetRL();

    try {
      await fbSignOut(auth);
    } catch (err) {
      logger.error('Sign-out failed', err);

      showErr(
        $('login-error'),
        'Kò ṣeé jáde. Jọ̀wọ́ tún gbìyànjú.'
      );
    }
  }
);
