'use strict';
/**
 * functions/src/utils/adminLogger.js
 * Structured server-side logger. Outputs to Google Cloud Logging automatically.
 * Sentry integration enabled by setting SENTRY_DSN in Secret Manager.
 * PII: UIDs truncated to 6 chars, emails masked before any external shipment.
 */
const functions = require('firebase-functions');

let _sentry = null;
function sentry() {
  if (_sentry !== null) return _sentry;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return (_sentry = false);
  try { const S = require('@sentry/node'); S.init({ dsn, tracesSampleRate: 0.1 }); return (_sentry = S); }
  catch { return (_sentry = false); }
}

function redact(ctx = {}) {
  const s = { ...ctx };
  if (s.uid)   s.uid   = String(s.uid).slice(0, 6) + '***';
  if (s.email) s.email = String(s.email).replace(/(.{2}).*(@.*)/, '$1***$2');
  return s;
}

function entry(level, message, error, context) {
  return {
    level, message,
    service:   'yorubagpt-functions',
    version:   '2.0.0',
    timestamp: new Date().toISOString(),
    ...(error ? { errorName: error.name, errorMessage: error.message, errorCode: error.code ?? null } : {}),
    ...redact(context),
  };
}

const log = {
  debug: (msg, ctx = {})        => functions.logger.debug(msg, entry('debug', msg, null, ctx)),
  info:  (msg, ctx = {})        => functions.logger.info(msg,  entry('info',  msg, null, ctx)),
  warn:  (msg, err = null, ctx = {}) => functions.logger.warn(msg, entry('warn', msg, err, ctx)),
  error: (msg, err = null, ctx = {}) => {
    functions.logger.error(msg, entry('error', msg, err, ctx));
    const S = sentry();
    if (S && err) S.withScope(scope => { scope.setExtras(redact(ctx)); S.captureException(err); });
  },
};

module.exports = { log };
