'use strict';
/**
 * functions/src/utils/cors.js
 * CORS allowlist for HTTPS Cloud Function endpoints.
 * Webhook POSTs from Stripe/FLW have no Origin header — they pass through.
 */
const cors = require('cors');

const ALLOWED = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',').map(o => o.trim()).filter(Boolean)
  .concat(['https://yorubagpt.netlify.app', 'http://localhost:5173', 'http://localhost:5000']);

const corsMiddleware = cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // server-to-server
    if (ALLOWED.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin not allowed — ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: false,
  maxAge: 600,
});

module.exports = { corsMiddleware };
