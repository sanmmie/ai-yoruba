#!/usr/bin/env node
/**
 * scripts/check-transfers.js
 *
 * CI gate: reads package.json dependencies and the CSP connect-src list in
 * firebase.json, and fails if any vendor is missing from docs/TRANSFERS.md.
 */
const fs = require('fs');
const path = require('path');

const root = __dirname.replace(/scripts$/, '');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const functionsPkg = JSON.parse(fs.readFileSync(path.join(root, 'functions/package.json'), 'utf8'));
const firebaseJson = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
const transfers = fs.readFileSync(path.join(root, 'docs/TRANSFERS.md'), 'utf8').toLowerCase();

const deps = new Set([
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
  ...Object.keys(functionsPkg.dependencies || {}),
  ...Object.keys(functionsPkg.devDependencies || {}),
]);

// Vendors inferred from dependency names.
const vendorHints = {
  '@anthropic-ai/sdk': 'Anthropic',
  'firebase': 'Firebase',
  'firebase-admin': 'Firebase',
  'firebase-functions': 'Firebase',
  '@firebase/rules-unit-testing': 'Firebase',
  'stripe': 'Stripe',
  'axios': 'Flutterwave', // used for Flutterwave API calls
  'dompurify': 'self',
  'marked': 'self',
  'vite': 'self',
  'jest': 'self',
  'eslint': 'self',
  '@sentry/node': 'Sentry',
  '@upstash/redis': 'Upstash',
  'cors': 'self',
  'express': 'self',
};

let missing = [];
for (const [dep, vendor] of Object.entries(vendorHints)) {
  if (vendor === 'self') continue;
  if (deps.has(dep) && !transfers.includes(vendor.toLowerCase())) {
    missing.push(`${vendor} (from ${dep})`);
  }
}

// CSP connect-src hosts must appear in TRANSFERS.md or be self.
const hosting = firebaseJson.hosting || {};
const headers = hosting.headers || [];
const csp = headers.find(h => (h.headers || []).some(x => x.key === 'Content-Security-Policy'));
const cspValue = csp ? csp.headers.find(x => x.key === 'Content-Security-Policy').value : '';

const hosts = [...cspValue.matchAll(/https?:\/\/[^\s"']+/g)].map(m => m[0].toLowerCase());
for (const host of hosts) {
  if (host.includes('ai-yoruba.web.app') || host.includes('ai-yoruba.firebaseapp.com') || host.includes('localhost')) continue;
  if (host.includes('google') || host.includes('firebase') || host.includes('stripe') || host.includes('flutterwave') || host.includes('anthropic') || host.includes('sentry') || host.includes('recaptcha') || host.includes('gstatic') || host.includes('googleapis')) continue;
  if (!transfers.includes(host)) missing.push(`CSP host ${host}`);
}

if (missing.length) {
  console.error('TRANSFERS.md is missing vendors:');
  missing.forEach(m => console.error('  - ' + m));
  process.exit(1);
}
console.log('TRANSFERS consistency check passed');