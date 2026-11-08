# Isolated runtime verification — Suncoast verified email reveal

**Prepared 2026-11-08** · **Production unchanged** · **Browser verification pending**

## Test environment

| Resource | Configured value |
|---|---|
| Cloudflare Worker | `suncoast-email-reveal-qa-20261108` |
| Browser test page | `https://suncoast-email-reveal-qa-20261108.iammoeskicova0808.workers.dev/qa` |
| Turnstile widget | `Suncoast Email Reveal QA 2026-11-08` (managed) |
| Widget sitekey | `0x4AAAAAAF4ubrYcqJYpCexy` (public identifier only) |
| Allowed widget hostname | `suncoast-email-reveal-qa-20261108.iammoeskicova0808.workers.dev` |
| Cloudflare secret bindings | `TURNSTILE_SECRET`, `SALES_EMAIL`, `PARTNERS_EMAIL` |
| Rate-limit binding | `EMAIL_REVEAL_LIMITER` — namespace `8811081`, 12 calls per 60 seconds |
| Returned email aliases | `sales@example.test` and `partners@example.test`, never real business email addresses |
| Deployed source | `security/email-reveal/qa-worker/runtime.js` |
| Automated source tests | `test.mjs`, `qa-worker/test.mjs`, `qa-worker/runtime.test.mjs`: 48 passing |
| CI run | https://github.com/88BitDH/business-suncoast/actions/runs/42485066230 |

**Do not enter real names, contact information, or customer data into this QA page.** The page has no contact-form fields and does not invoke Make, Zoho or email-sending services.

The minimal QA page exercises the same staged server-side validation logic as `security/email-reveal/worker.mjs`, adapted to the QA hostname. It uses its own small test UI; the complete business-site modal in `assets/email-reveal.js` is separately covered by offline tests but **has not yet been browser-tested against a live Worker**.

## What was independently verified

- Cloudflare reports the QA Worker `workers.dev` URL **enabled**, preview URLs disabled, 2 deployment records, four bindings, and compatibility date `2026-11-08`.
- Cloudflare confirms the Turnstile widget's hostname restrictions and `managed` mode.
- GitHub Actions reports **48/48 offline tests passed** for email-reveal API rules, site-wide contact-link contracts, staged article templates, full-client QA source, and compact runtime QA source.
- Both actual aliases are synthetic `.test` addresses, set as encrypted bindings; no production addresses or Turnstile secrets are stored in GitHub.
- Live business pages, Cloudflare production Workers/routes/DNS, scheduled article publication branches, and Make scenarios were not modified during the QA preparation.
- A browser GET to the new `workers.dev` URL could not be independently fetched through the available browsing environment; **the live page response and real token acceptance remain unverified**.

## One-pass browser smoke test — manual action required

1. Open `https://suncoast-email-reveal-qa-20261108.iammoeskicova0808.workers.dev/qa` in a normal browser.
2. Verify you see the **Suncoast email reveal — QA** title, two test choices (Sales and Partners), and no actual business mailbox addresses.
3. Leave **Sales** selected. Complete the Cloudflare Turnstile challenge. A successful run should show **sales@example.test** as a clickable mail link.
4. **Reload the page** to get a fresh single-use token. Select **Partners**, complete the challenge, and expect **partners@example.test**.
5. Report the exact visible result or screenshot. If you see an HTTP 403/429/503, widget failure, blank page or script error, do not repeatedly submit. Record the result for diagnosis.

Note: Cloudflare Turnstile tokens are single-use. The app verifies the exact QA hostname and `email_reveal` action, so a token generated on the business contact form cannot be substituted.

## Remaining gates before any production action

- [ ] Confirm the browser QA page renders and the real Turnstile token is accepted by the *deployed* Worker.
- [ ] Confirm both synthetic aliases reveal after verification, while invalid/expired/replayed tokens fail in the real runtime.
- [ ] Test the **actual business-site modal and shared header** on mobile, desktop, keyboard and screen reader, not only this compact QA page.
- [ ] Configure a separately named **production** email-reveal Worker and Cloudflare route `business.suncoasttechsupport.net/api/email-reveal`, with proper encrypted real Sales/Partners aliases and rate limiting **only after explicit approval**.
- [ ] Ensure `/api/email-reveal` is proxied and cannot be accessed on unrelated hosts. Verify production Cloudflare Turnstile widget action/hostname.
- [ ] Merge the 18 staged pages as an atomic release with the API after verifying rollback. Preserve latest mobile navigation and contact-click tracking.
- [ ] Apply guarded-email patches to scheduled CISA/DigiCert article branches only when the API is live, coordinating with the publishing automation.
- [ ] Review Privacy Policy replacement of obsolete `.net` support address and whether Sales is an appropriate policy-contact destination.
- [ ] Independently address hardcoded secrets and public `workers.dev` exposure in existing lead Workers after the email reveal rollout.

## Important constraints

A human can still reveal and copy an address after completing Turnstile, so this limits casual automated harvesting rather than guaranteeing spam prevention. The binding's rate limiting is **approximate per Cloudflare location**, not a strict global quota. No automation or customer delivery is involved in this test.

**Release authority:** Do not change production site assets, main branch, DNS, Worker routes, live Workers or email addresses without the owner's separate approval.
