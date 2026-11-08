# Isolated runtime verification — Suncoast verified email reveal

**Updated 2026-11-08** · **Production unchanged** · **Original QA test user-confirmed successful; full modal browser test pending**

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
| Deployed source | `security/email-reveal/qa-worker/index.js` |
| Automated source tests | `test.mjs`, `qa-worker/test.mjs`, `qa-worker/runtime.test.mjs`, `release-gates.test.mjs`: see current CI status |
| CI run | https://github.com/88BitDH/business-suncoast/actions?query=branch%3Afeature%2Fverified-email-reveal-latest-2026-11-08 |

**Do not enter real names, contact information, or customer data into this QA page.** The page has no contact-form fields and does not invoke Make, Zoho or email-sending services.

The **full production-style Show Email modal** is now served by the isolated QA Worker. The current QA page includes both inline Sales/Partners controls, an envelope-icon button in the simulated business header, and the case where the contact page has already loaded Cloudflare Turnstile. The Worker continues returning synthetic `.test` aliases and retains the four QA bindings.

The user selected the prior shortcut **“Both test addresses appeared”**, confirming the earlier simplified QA flow worked in their browser. The full modal is a **new deployment** and needs its own mobile, desktop and keyboard verification before production sign-off.

## What was independently verified

- Cloudflare confirms the QA Worker `workers.dev` URL **enabled**, preview URLs disabled, four bindings preserved after the modal update, and compatibility date `2026-11-08`.
- Cloudflare confirms the Turnstile widget's hostname restrictions and `managed` mode.
- GitHub Actions tests exercise the email-reveal API rules, all business pages, article templates, the QA full modal source, and a separate compact runtime prototype; consult the latest CI run for current totals.
- Both actual aliases are synthetic `.test` addresses, set as encrypted bindings; no production addresses or Turnstile secrets are stored in GitHub.
- Live business pages, Cloudflare production Workers/routes/DNS, scheduled article publication branches, and Make scenarios were not modified during the QA preparation.
- A browser GET to the new `workers.dev` URL could not be independently fetched through the available browsing environment; **the live page response and real token acceptance remain unverified**.

## Full-modal browser test — manual action required

1. Open `https://suncoast-email-reveal-qa-20261108.iammoeskicova0808.workers.dev/qa` on a desktop browser.
2. Select **Show Sales Email** (inline button), complete Turnstile in the dialog, and confirm `sales@example.test` appears.
3. Close the dialog, select **Show Partners Email**, and complete a fresh Turnstile challenge; confirm `partners@example.test` appears.
4. Test the **envelope icon in the blue header**; verify that it opens the same Sales verification dialog. Test **Escape**, the Close button, keyboard Tab, and focus returning to the original button.
5. Open the same page on a phone or narrow browser viewport. Confirm the dialog fits without sideways scrolling, Turnstile controls are reachable, and the **contact form / call** fallback works.
6. Report any error, blank widget, inaccessible verification, HTTP 403/429/503, or layout problem. Avoid repeatedly submitting after a failure.

Do not use a real client email or personal data.

## Remaining gates before any production action

- [x] User-confirmed synthetic Sales and Partners reveals with the earlier QA browser page.
- [ ] Confirm the **new full modal** renders, accepts real Turnstile tokens, and reveals both synthetic aliases.
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
