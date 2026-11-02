# TAX_NOTES.md

Open questions for the accountant.  Do not implement tax calculation or
change displayed prices without approval.

## VAT on digital services

- Is YorùbáGPT a taxable digital service under current Nigerian tax laws?
  VERIFY.
- Is VAT tax-inclusive or tax-exclusive for this product? VERIFY.
- Who is the liable party — the Nigerian entity or the foreign vendor?
  VERIFY.

## Pricing display

- Current display is tax-exclusive.  If VAT is tax-inclusive, the displayed
  price must change.  Do not change it without approval.

## Dual NGN and USD pricing

- Does charging in both NGN (Flutterwave) and USD (Stripe) create
  foreign-exchange or tax obligations? VERIFY.
- Which currency is the tax base? VERIFY.

## FCCPC consumer-protection rules for auto-renewal

- The Terms require an unticked auto-renewal acknowledgement before
  checkout and a renewal reminder before charging.  VERIFY these against
  the current FCCPC rules with counsel.

## Refund policy

- Placeholder text in terms.html must be supplied by the user.  Do not
  invent it.
