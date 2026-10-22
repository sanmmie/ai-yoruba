# AUDIT.md - YorùbáGPT Fix & Upgrade

Branch: fix/master-upgrade (initialized from current repo state)

## Phase 1 findings (confirmed against code)

### 1.1 Firestore rules - users can grant themselves Premium
- **firestore.rules:13-17**: `noPaymentFieldsWritten()` forbids top-level keys `stripeCustomerId`, `flutterwaveCustomerId`, `subscriptionId`, `currentPeriodEnd`, `provider` only. `subscription` and `usage` are nested maps - not in forbidden list. A user can write `subscription.plan = 'premium'`, `usage.*` etc.
- **firestore.rules:21**: `allow create: if isOwner(userId);` - prompt says "keep create: if false". Current code differs.
- **firestore.rules:22**: `allow update: if isOwner(userId) && noPaymentFieldsWritten();` - needs to be whitelist-only (`displayName`, `preferences`).
- **Status:** Confirmed.

### 1.2 Client/backend protocol mismatch (onCall vs fetch)
- **src/app.js:229-252** calls `fetch(API_ENDPOINT, { method:'POST', headers:{'Content-Type':'application/json','Authorization':Bearer..., body: JSON.stringify({message, history:...}) }})` and expects `res.json()` with `data.response`. 
- **functions/src/handlers/aiHandler.js:37-84** exports `yorubaAI` as `functions.runWith({...}).https.onCall(...)` - an onCall function. Callables require client to use `httpsCallable` and send `{data:{...}}`; the function receives `data` as the payload directly. The client is doing raw fetch to the HTTPS endpoint URL - this will not work correctly with onCall; also onCall expects different protocol. But looking up how it's actually deployed - onCall functions are still callable via HTTP but the protocol is different. Also the client constructs URL as `https://us-central1-ai-yoruba.cloudfunctions.net/yorubaAI` and does raw fetch - but onCall functions have a specific format. This is indeed a mismatch.
- **Status:** Confirmed.

### 1.3 Stripe webhook body parsing
- **functions/src/handlers/webhookStripe.js:27** uses `router.use(express.raw({ type: 'application/json' }));` inside an express app mounted to `onRequest(app)`. But in Cloud Functions v1 onRequest, the body is already parsed by the platform depending on content-type; using express.raw() may not give raw body as expected. Also they do `stripe.webhooks.constructEvent(req.body, sig, secret)` - if body is parsed as JSON object by something else, constructEvent fails. The fix says use `req.rawBody`. Also need to check - in v1 onRequest, rawBody might be available.
- **Status:** Confirmed as written.

### 1.4 Duplicate client files
- **src/chat.js** exists (legacy client using onCall via httpsCallable from firebase.js) and **src/firebase.js** exists (re-initializes app, gets analytics). **index.html:286** loads `<script type="module" src="/src/chat.js"></script>`. **src/app.js** is the main app (also imported elsewhere via auth flow). Having both chat.js and app.js logic can cause conflicts.
- **Status:** Confirmed.

### 1.5 Quota/rate limiting
- **functions/src/middleware/subscriptionGate.js**: reads user doc, if not exists creates with usage incremented to 1 (line 22) - consumes quota on first request? Also increments after checking (line 29) with read-modify-write, not atomic transaction. Fails open on error (line 33). Only checks if premium active, otherwise applies FREE_LIMIT. Day boundary is UTC via `toISOString().slice(0,10)`. 
- **functions/src/middleware/rateLimiter.js**: always passes plan from caller; aiHandler passes 'free' (line 48 in aiHandler). Uses in-memory fallback, upstash not in functions/package.json. Fails open on redis errors.
- **Status:** Confirmed.

### 1.6 Flutterwave subscription lifecycle
- **functions/src/handlers/webhookFlutterwave.js**: sets periodEnd to +30 days from now (line 52) regardless of actual subscription period. Doesn't check amount/currency/tx_ref format. Gets uid from meta only (line 49, 67). No deduplication. Doesn't handle renewals properly.
- **subscriptionGate.js** only checks if plan is premium and status active - doesn't check currentPeriodEnd expiry.
- **Status:** Confirmed.

### 1.7 Smaller items
- **functions/src/index.js** only exports 4 functions, no cleanupUserData. No test endpoint exported currently.
- **vite.config.js:11** has `drop_console: true` - removes all console including console.error.
- **index.html** references icons that may not exist - manifest.json needs checking.
- **netlify.toml:16** CSP has wrong functions host `gen-lang-client-0861985618` vs actual project `ai-yoruba` based on API_ENDPOINT.
- **Status:** To confirm details as we go.
