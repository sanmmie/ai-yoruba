/**
 * src/utils/logger.js
 *
 * Structured client-side logger.
 * Dev:  full console output with stack traces
 * Prod: console.error for warn/error only; Sentry hook ready
 * PII:  UIDs truncated, emails masked before any external shipment
 */

const IS_PROD = import.meta.env.PROD ?? false;

function redact(ctx = {}) {
  const s = { ...ctx };
  if (s.uid)   s.uid   = String(s.uid).slice(0, 6) + '***';
  if (s.email) s.email = String(s.email).replace(/(.{2}).*(@.*)/, '$1***$2');
  return s;
}

function log(level, message, error = null, context = {}) {
  const entry = {
    level, message,
    app:       'YorùbáGPT',
    version:   '2.0.0',
    timestamp: new Date().toISOString(),
    url:       window.location.pathname,
    ...(error ? { errorName: error.name, errorMessage: error.message, errorCode: error.code ?? null } : {}),
    ...redact(context),
  };

  if (!IS_PROD) {
    // eslint-disable-next-line no-console
    console[{ debug:'debug', info:'info', warn:'warn', error:'error' }[level]](
      `[YGPT:${level.toUpperCase()}]`, message, error ?? '', context
    );
    if (error && !IS_PROD) console.debug(error.stack);
  } else if (level === 'error' || level === 'warn') {
    // eslint-disable-next-line no-console
    console.error('[YGPT]', JSON.stringify(entry));
  }

  // Sentry — enable by setting VITE_SENTRY_DSN
  // if (IS_PROD && level === 'error' && window.Sentry) {
  //   window.Sentry.withScope((scope) => {
  //     scope.setExtras(redact(context));
  //     window.Sentry.captureException(error ?? new Error(message));
  //   });
  // }
}

export const logger = {
  debug: (msg, ctx)       => log('debug', msg, null,  ctx),
  info:  (msg, ctx)       => log('info',  msg, null,  ctx),
  warn:  (msg, err, ctx)  => log('warn',  msg, err,   ctx),
  error: (msg, err, ctx)  => log('error', msg, err,   ctx),
};
