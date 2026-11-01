# Phase 0.1 AUDIT (D1–D23)

Branch: fix/master-upgrade-v2 (HEAD 149775b)
Date: 2026-10-31

## Confirmed

| # | Finding | Evidence (file:line) | Status |
|---|---|---|---|
| D1 | Firestore rules allow only displayName/preferences update on users/{uid}; server-only collections denied. However check for old noPaymentFieldsWritten() removed/rewritten? Rules show whitelist updated in current state but need to verify legacy pattern. | firestore.rules:1-170 | CONFIRMED (current rules hardened; task states D1 was issue in old state - verify against old audit) |
| D2 | App uses fetch to cloudfunctions yorubaAI in src/api/stream.js fallback and legacy; current client uses /api/chat or env endpoints. | src/api/stream.js:38-70, src/app.js references | PARTIAL/CHANGING |
| D3 | Multiple Firebase inits? src/firebase-config.js exists; deleted src/firebase.js per rules? grep shows src/firebase.js referenced in old files - check existence. | src/firebase-config.js present; src/firebase.js not present now? | TO CHECK |
| D4 | src/chat.js deleted/removed? | check | TO CHECK |
| D5 | Webhook Stripe: functions/src/webhookStripe.js | functions/src/webhookStripe.js exists | TO CHECK |
| D6 | subscriptionGate.js | functions/src/subscriptionGate.js exists | TO CHECK |
| D7 | rateLimiter.js | functions/src/rateLimiter.js exists | TO CHECK |
| D8 | webhookFlutterwave.js | functions/src/webhookFlutterwave.js exists | TO CHECK |
| D9 | root functions/index.js dead vs src/index.js main | functions/package.json main, functions/src/index.js exports | TO CHECK |
| D10 | auth.js password message | src/auth.js | TO CHECK |
| D11 | vite.config.js drop_console | vite.config.js | TO CHECK |
| D12 | manifest icons missing | public/manifest.json, public/ icons | TO CHECK |
| D13 | firebase.json headers/CSP | firebase.json | TO CHECK |
| D14 | aiHandler.js old model/streaming | functions/src/aiHandler.js | TO CHECK |
| D15 | Live differs from repo | noted | NOTED |
| D16 | README advertising | README.md | TO CHECK |
| D17 | sessions.js MAX_SESSIONS cutoff | src/modules/sessions.js | TO CHECK |
| D18 | client localStorage daily counter | src/app.js / modules | TO CHECK |
| D19 | tests/CI state | package.json scripts, .github | TO CHECK |
| D20 | firebase.json rewrites/headers | firebase.json | TO CHECK |
| D21 | legacy host references | grep needed | TO CHECK |
| D22 | compliance gaps on UI | pages/html | TO CHECK |
| D23 | various gaps | general | TO CHECK |

Evidence collected as we go.
