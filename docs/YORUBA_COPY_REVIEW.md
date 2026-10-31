# YORUBA_COPY_REVIEW.md

Every string below must be reviewed by a qualified native Yorùbá speaker
before the live channel is opened.  Do not invent or rewrite Yorùbá —
pending entries stay as PENDING TRANSLATION in src/i18n/yo.json.

## Seed list

| # | Current value | Location | Proposal | Reason | Status |
|---|---|---|---|---|---|
| 1 | "YorùbáGPT — Èrò Ìbánisọrọ̀ AI ní èdè Yorùbá" | index.html title and OG text | Proposal: "YorùbáGPT — Ẹ̀rọ Ìbánisọrọ̀ AI ní èdè Yorùbá" | "Èrò" vs "Ẹ̀rọ" — verify the intended character | PENDING |
| 2 | "Kò sí nínú àpọỘpọ̀?" | index.html:146 (verify screen) | Proposal: "Kò sí nínú àpọ́ rán?" | Garbled "àpọỘpọ̀"; intended meaning is "spam folder" | PENDING |
| 3 | "Ìfòfindè ìdáhùn yára" | pricing.html:56 (Premium feature) | Proposal: "Ìfòfindè ìdáhùn yára" reads as "prohibition"; intended meaning is "priority fast replies" | Misleading wording | PENDING |
| 4 | "Ọfẹ̀" | index.html:216 (plan badge), auth.js:83 | Proposal: "Ọ̀fẹ́" | Missing tone mark on the first vowel | PENDING |
| 5 | "Ìmúra" | index.html:204, app.js:41 (status/ready) | Proposal for settings: "Ètò" | "Ìmúra" used for status or settings — verify intended meaning | PENDING |
| 6 | "Ń ṣejúṣeṣe…" | index.html:49 (loading) | Keep or refine | Verify the verb form | PENDING |
| 7 | "Ìbánisọrọ̀" | index.html:166, app.js:141 | Verify tone dots are present | Missing tone dots | PENDING |
| 8 | Rule 9 partnership wording | functions/src/prompts/system.js:14 | Keep verbatim, but REQUIRING WRITTEN CONFIRMATION before launch | False affiliation claim is a legal and trust risk | REQUIRES CONFIRMATION |
| 9 | All strings in src/i18n/yo.json | — | Every value is "PLACEHOLDER" | PENDING TRANSLATION | PENDING |
| 10 | Legal and consent copy | privacy.html, terms.html | Written in English first; Yoruba version must come from a qualified human translator | Do not generate | PENDING |

## Rule
- Never generate Yoruba here.  Structure the i18n files for both languages
  and mark Yoruba entries PENDING TRANSLATION.
- Legal and consent copy is written in English first.