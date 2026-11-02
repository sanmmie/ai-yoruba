# QA_CHECKLIST.md

Passed at 360px, light and dark, on Chrome Android and Safari iOS,
including the consent, settings, delete and report flows.

## Boot

- [ ] App boots with no Firebase initialisation errors (getApps().length === 1)
- [ ] Console-clean login under a strict CSP (no CSP violation, no duplicate-app, no unauthorized-domain)
- [ ] Sign-in screen links Privacy Policy and Terms
- [ ] Sign-up screen shows consent checkbox and 18+ declaration
- [ ] Chat screen warns that output may be inaccurate and links Terms
- [ ] Footer shows the sensitive-details reminder in both languages

## Chat

- [ ] Streaming works; deltas render on requestAnimationFrame
- [ ] Typing indicator before the first token; caret during streaming
- [ ] Stop keeps partial text and refunds quota exactly once
- [ ] Copy, Regenerate, Edit-and-resend, thumbs up/down, Report all work
- [ ] Markdown renders safely (hostile input proves nothing executes)
- [ ] Code blocks have a Copy button
- [ ] Tables scroll horizontally
- [ ] History loads server-side; the client sends only sessionId, message and clientRequestId

## Quota and limits

- [ ] Free user cannot gain Premium
- [ ] Free user cannot exceed the daily limit under parallel requests
- [ ] Free user does not lose quota on a failed or aborted request
- [ ] 50 parallel requests against a limit of 10 admit exactly 10
- [ ] Double refund is a no-op
- [ ] Midnight Lagos rollover resets the counter
- [ ] Burst limit returns 429 with Retry-After
- [ ] "N messages left today" shows from the server value

## Payments

- [ ] Checkout shows price, currency, billing interval, renewal date, cancellation terms
- [ ] Auto-renewal acknowledgement is unticked before checkout
- [ ] Stripe and Flutterwave webhooks are verified, idempotent under concurrent replay, order-safe
- [ ] Subscription expiry downgrades correctly
- [ ] The client never trusts the redirect query string (R12)

## Consent and privacy

- [ ] No chat is possible without recorded Terms and Privacy consent and an 18+ declaration
- [ ] Training use is a separate, default-off choice
- [ ] Consent withdrawal works and blocks the next chat
- [ ] Download my data returns profile, consents, sessions and messages
- [ ] Delete all chats and delete my account work, are idempotent, and leave tombstones
- [ ] No message content appears in logs, Sentry or analytics

## Mobile

- [ ] 100dvh, viewport-fit=cover, safe-area insets
- [ ] 360px minimum width
- [ ] 44px touch targets
- [ ] Swipe to open the sidebar
- [ ] Keyboard-aware composer
- [ ] No layout shift while streaming
- [ ] Auto-stick to bottom only when the reader is near it
- [ ] "Jump to latest" button appears when scrolled up

## Performance

- [ ] Main chunk under 150 kB gzip
- [ ] Markdown library and pricing page are code-split
- [ ] Lighthouse mobile accessibility >= 95

## Accessibility

- [ ] role="log" on the message list with aria-live only for finished messages
- [ ] Visible focus rings
- [ ] Focus trap and Esc in dialogs
- [ ] Labelled controls
- [ ] Reduced motion honoured

## i18n

- [ ] Yoruba/English toggle from the JSON files
- [ ] Every src/i18n/yo.json value is reviewed by a native speaker or marked PENDING TRANSLATION
- [ ] Every suspect string is listed in docs/YORUBA_COPY_REVIEW.md
