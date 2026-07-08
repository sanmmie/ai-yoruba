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
import { getFirestore, connectFirestoreEmulator,
         enableIndexedDbPersistence }                       from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator }           from 'firebase/functions';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth      = getAuth(app);
export const db        = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');

if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectFunctionsEmulator(functions, 'localhost', 5001);
  console.info('[Firebase] Emulators connected');
}

enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') console.warn('[Firebase] Persistence: multiple tabs');
  else if (err.code === 'unimplemented')  console.warn('[Firebase] Persistence: not supported');
});

export default app;
