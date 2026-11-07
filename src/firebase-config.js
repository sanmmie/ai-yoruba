/**
 * src/firebase-config.js
 *
 * Firebase SDK bootstrap — all values from environment variables.
 *
 * SECURITY: These VITE_* values are public Firebase project identifiers.
 * They do NOT grant privileged access. Real security lives in:
 *   1. Firestore Security Rules
 *   2. Firebase Auth token verification in Cloud Functions
 *   3. Stripe/Flutterwave webhook signature verification
 *
 * NEVER import server secrets (STRIPE_SECRET_KEY, ANTHROPIC_API_KEY, etc.) here.
 */

import { initializeApp, getApps }                          from 'firebase/app';
import { getAuth, connectAuthEmulator }                     from 'firebase/auth';
import { getFirestore, initializeFirestore, connectFirestoreEmulator,
         persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator }           from 'firebase/functions';
import { getAnalytics, isSupported }                        from 'firebase/analytics';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const missingConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => !value || /^(your[-_]|AIzaSy\.\.\.)/i.test(value.trim()))
  .map(([key]) => key);

if (missingConfig.length > 0) {
  throw new Error(
    `[Firebase] Missing or placeholder config: ${missingConfig.join(', ')}. ` +
    'Copy .env.example to .env.local, add your Firebase project values, and restart Vite.',
  );
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth      = getAuth(app);
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (e) {
  db = getFirestore(app);
}
export const functions = getFunctions(app, 'us-central1');

export let analytics = null;
const analyticsConsent = typeof localStorage !== 'undefined' ? localStorage.getItem('ygpt_analytics_consent') : null;
if (analyticsConsent === 'granted') {
  isSupported().then((supported) => {
    if (supported) {
      try {
        analytics = getAnalytics(app);
      } catch (e) {
        // ignore
      }
    }
  }).catch(() => {});
}

if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectFunctionsEmulator(functions, 'localhost', 5001);
  console.info('[Firebase] Emulators connected');
}

export { db };

export default app;
