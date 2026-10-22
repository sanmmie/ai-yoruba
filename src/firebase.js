// src/firebase.js
import { getAnalytics } from "firebase/analytics";
import { httpsCallable } from "firebase/functions";
import app, { auth, functions } from "./firebase-config.js";

const analytics = getAnalytics(app);

export { app, analytics, auth, functions, httpsCallable };