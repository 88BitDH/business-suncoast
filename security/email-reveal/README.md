# Suncoast Tech Support — verified Show Email rollout

**November 8, 2026. STAGING ONLY — do not merge or deploy before completing all gates.**

## Scope completed on this branch

- **18 main HTML business pages:** replaced all hardcoded Sales and Partners `mailto:` anchors with accessible `Show Sales Email` / `Show Partners Email` buttons. Retained existing envelope icon SVG in the header. No existing phone, SMS, form action, or contact-form Turnstile widget was changed.
- **Homepage:** converted visible Sales and Partners addresses to protected buttons.
- **About:** converted the Partner email link.
- **Privacy:** replaced three obsolete references to `support@suncoasttechsupport.net` with the protected Sales contact action. This substantive contact-policy wording must be reviewed before public release.
- **Seven planned alert articles:** prepared transformed, non-web-published `.html.txt` templates at `security/email-reveal/scheduled-patches/` and mapping manifest. **The actual DigiCert/CISA scheduled publication branches were not modified**; doing so before the API is live could create unusable controls when automation publishes.
- **Client:** `assets/email-reveal.js` and `assets/email-reveal.css`. Click-to-reveal dialog, an explicit Cloudflare Turnstile challenge, accessible Escape/Close and fallback contact links. No addresses in static HTML, client JS or CSS.
- **Worker:** `security/email-reveal/worker.mjs`. Requires Siteverify `success`, exact hostname `business.suncoasttechsupport.net`, and action `email_reveal`, then returns only the requested alias. Uses no-store, fail-closed behavior, exact path/origin checks, and a mandatory rate-limiting binding.
- **Dedicated Turnstile widget:** `Suncoast Verified Email Reveal - Staged`, public sitekey `0x4AAAAAAF4tQwhQiUBOGQe0`, allowed hostname `business.suncoasttechsupport.net`. Its secret is not in this repository.
- **CI:** `staged-email-reveal.yml`. Staging-only syntax and 23 offline security/site-contract tests; GitHub Actions run **42482902493**, all 23 passed, no deploy.
- Production branch, existing forms, active Make workflows, Cloudflare routes and DNS: **not changed** by this work.

## Exact files to deploy as a unit

1. `assets/email-reveal.js` (static front end).
2. `assets/email-reveal.css` (scoped styling).
3. `security/email-reveal/worker.mjs` as a **separately named Worker** behind the exact intended business hostname route `/api/email-reveal`.
4. The 18 modified business HTML pages.
5. Transform and merge the seven queued articles **only after** the Worker route and widget are running; coordinate with article-publishing automation.

## Required Cloudflare configuration (not created yet)

- Create a **new separate email-reveal Worker**, not an overwrite of `suncoast-lead-form` or `suncoast-b2c-lead-form`.
- Bind `TURNSTILE_SECRET` to the *dedicated staged email reveal widget* secret (encrypted text binding).
- Bind `SALES_EMAIL` and `PARTNERS_EMAIL` with the real approved addresses (encrypted text bindings, never GitHub); validate aliases are real and monitored.
- Bind a Cloudflare Worker **Rate Limiting** binding as `EMAIL_REVEAL_LIMITER` (e.g., start with 12 requests/60 seconds **per IP + alias**, then tune after legitimate usage testing). Assign a unique numeric namespace and check Free-plan availability/configuration. The binding is mandatory and the Worker returns HTTP 503 if absent. Cloudflare per-location limits are **approximate**, not global strict limits.
- Route `https://business.suncoasttechsupport.net/api/email-reveal` to the new Worker via Cloudflare; GitHub Pages remains site origin. Verify the route does not collide with existing `/compliance*`, `/it-services*`, or `/cybersecurity*` redirect Workers.
- Do **not** use or expose a public `workers.dev` route for this Worker; the code rejects unexpected hosts as a second layer.
- Set observability with privacy-safe status-only logs (no raw token, email, or IP in logs); test actual response headers and Cloudflare security settings.

## Release gates — all must pass before production merge

- [ ] Review the Privacy Policy change replacing the old `.net` support address with guarded Sales. Confirm legally appropriate support/privacy contact.
- [ ] Obtain exact configured Worker route, encrypted bindings, Turnstile sitekey/secret association, and mandatory rate-limiting binding (or owner-approved alternate WAF implementation).
- [ ] Staging runtime test from an **allowed hostname** with a real Turnstile response; validate success, invalid/expired/reused tokens, wrong action/hostname, rate limit, and service failures. Offline tests alone do not prove Cloudflare runtime success.
- [ ] Confirm the browser email-reveal flow on desktop, mobile, keyboard, screen reader, and with existing lead-form Turnstile script on the same page.
- [ ] Verify Sales and Partners inboxes actually receive mail when the revealed address is used; contact form and call/text fallback remain prominent.
- [ ] Use source and built-page scans for all current pages, scheduled articles, and any public assets to ensure no embedded `mailto:` or plain address remains.
- [ ] Coordinate with the Nov 10 DigiCert and upcoming CISA publishing automation: current queue branches still contain raw Sales links. Do not allow older headers to overwrite the protected frontend after release.
- [ ] Rollback plan: revert UI to working lead-form and phone links without exposing addresses or altering the live lead Workers; keep safe restore point.
- [ ] Explicit user approval for each **production** change (new Worker deployment, route, bindings, HTML merge, queued article publication integration).

## D — Independent remaining-security-gap audit

| Priority | Finding | Status at 2026-11-08 | Decision |
|---|---|---|---|
| P0 | Production Sales/Partners addresses exposed in current live HTML; seven queued articles also expose header address | **UNRESOLVED LIVE**; only staging branch protected | Deploy all pieces together only after API verified |
| P0 | Production lead Workers have hardcoded Turnstile secret and Make webhook URLs, zero encrypted bindings | **UNRESOLVED LIVE**; separate hardened Worker already staged and passed 37 offline tests | Plan staged B2B/B2C rotation and separate cutovers |
| P1 | Both production form Workers' `workers.dev` endpoints enabled with no app-level rate limiter observed | **UNRESOLVED LIVE** | Implement protected routes or Worker limiting without interrupting forms |
| P1 | No `/api/email-reveal` Cloudflare Worker route currently configured; staged Worker not deployed | **BLOCKS REVEAL RELEASE** | Add behind proxied hostname with mandatory secrets/rate limiter |
| P1 | DigiCert Nov 10 and CISA queued branches retain plain email header | **FUTURE REPUBLICATION RISK** | Apply patch templates only after release gate; coordinate automation |
| P1 | Cloudflare Always Use HTTPS = off, minimum TLS version 1.0 | **REQUIRES ASSESSMENT** | Evaluate origin and compatibility, then request independent approval |
| P2 | Site-wide CSP/security-response headers not validated by runtime; current inspection focused on source/Cloudflare config | **NOT VERIFIED** | Inspect actual HTTPS responses and report-only policy before enabling |
| P2 | Privacy Policy formerly references obsolete `.net` support address (3 occurrences) | **CORRECTED IN STAGING ONLY** | Review wording and approvals |
| P2 | Make QA scenario for isolated lead Worker cannot activate because account active-scenario limit reached | **TEST BLOCKER** | Do not deactivate production; limited queued webhook test or obtain temporary capacity |
| P2 | Public GitHub commit history and third-party indexing may retain old email addresses indefinitely | **INHERENT LIMIT** | Reducing current exposure lowers basic harvesting, not confidentiality |
| P3 | Email reveal CAPTCHA adds visitor friction; older/senior visitors might prefer phone | **UX RISK** | Test mobile and accessible fallbacks, monitor contact conversion rate |

## Important limitations

The new UI is not useful until Cloudflare API route, bindings, rate limiting, real Turnstile test, and email-receipt test are complete. Buttons on an accidentally published static site will show a **contact form / phone fallback**, but the primary reveal will fail. Never publish the new UI before the backend is verified.

A person (or human-assisted harvester) can still complete Turnstile and copy addresses. Previous public addresses might already be indexed. This change reduces casual scraping, not guaranteed spam elimination.

## References

- Cloudflare Turnstile: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Cloudflare client-side: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
- Cloudflare Workers rate limiting: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Cloudflare Worker secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Scheduled patch manifest: `security/email-reveal/scheduled-patches/manifest.json`.
