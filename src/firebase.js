// src/firebase.js
// Shared Firebase bootstrap lives in firebase-config.js.
// Re-export the single app instance and services to avoid duplicate initialization.
export { default as app, auth, functions, db } from './firebase-config.js';
export { httpsCallable } from 'firebase/functions';
