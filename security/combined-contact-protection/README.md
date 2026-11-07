# Unified Suncoast contact protection — phased implementation (STAGING ONLY)

**Status:** Planning and offline testing only. This file lives on a nonproduction branch. No production Worker, Cloudflare DNS/rules, form action, email address, phone number, or marketing article has been changed as part of this combined plan.

## Decision and goals

1. **Never lose or block a legitimate lead.** Preserve business and residential forms, Make.com routing, Zoho notifications, thank-you redirects, and UTM details.
2. Harden the two existing form Workers first, **without forcing email OTP during initial hardening**.
3. Add an optional Turnstile-verified "Show Sales/Partners Email" experience only after backend safety is proven.
4. Keep the publicly visible click-to-call/text phone number; do not require customer registration.
5. Deploy changes in small, independently testable releases with explicit approval and rollback.

## Verified starting point (2026-11-07)

- Business static GitHub Pages repository: `88BitDH/business-suncoast` at `business.suncoasttechsupport.net`; Cloudflare DNS CNAME is proxied.
- Business form posts to the publicly reachable `suncoast-lead-form` Worker on `workers.dev`; several existing pages use it. Residential has a separate `suncoast-b2c-lead-form` Worker.
- Both Workers validate a Turnstile response via Siteverify and check `result.success`, but the deployed code has no hostname check, and both use the same Turnstile secret embedded in source.
- Both embed Make.com webhook URLs in deployed Worker source. The business Worker logs customer submission fields and downstream response bodies. No application-level rate-limit implementation was found.
- Cloudflare email obfuscation is already enabled for the `.net` zone, but `mailto:` addresses and visible Sales/Partners addresses remain publicly available in HTML. The recent header accessibility-label cleanup removed redundant addresses only.
- Separate previously staged projects: `feature/contact-email-otp` (gateway + hardened legacy Worker with enforced OTP secret) and `feature/turnstile-email-reveal-design` (design only). The OTP-dependent hardened Worker must **not** replace the live Worker before an OTP gateway is operational.
- Existing DigiCert and CISA article publication automations are scheduled. Their static headers have been updated for the recent changes, but their future publication must be checked for email exposure at rollout.

## Phase 0 — Baseline, backup and testing gates (read-only)

- Capture exact current source, bindings **names/types only** and routes, not secret values. Verify which websites, widgets and Workers use the shared Turnstile sitekey.
- Run baseline test submissions from business and residential forms with controlled test identities. Confirm Make.com and Zoho receipt, UTM field mapping, thank-you redirect and error handling. Identify an owner who will confirm inbound leads after each cutover.
- Confirm Cloudflare subscription features and any rate-limit quotas/cost before selecting a rule.
- Audit site-wide and scheduled-article `mailto:`, plain email text and metadata before attempting email reveal.
- **Gate 0:** Baseline form delivery confirmed and rollback artifacts ready. No secrets are exposed in GitHub or logs.

## Phase 1 — Safe form-Worker hardening (highest priority)

Prepare a **compatible, non-OTP-required** stage of both form Workers. The staged `worker/legacy-lead/index.js` on `feature/contact-email-otp` is *not* drop-in compatible because it requires an OTP gateway secret; build a compatibility-preserving variant for this phase.

- Put Turnstile secret and webhook URL into encrypted Cloudflare Worker bindings (do not place values in the repository, screenshots or chat).
- Validate successful Siteverify response, **expected hostname** and an appropriate Turnstile action if widgets supply one. Keep original form field schema and redirect contract unchanged.
- Remove PII and webhook response bodies from application logs. Use anonymized status/error codes and minimal counts only.
- Reject missing/malformed input, cap request size, fail closed on verification/network errors.
- Add targeted abuse protection on actual form endpoint. If `workers.dev` remains active, restrictions on the main .net zone alone do **not** protect it; either use a Worker-level rate limit or migrate forms to a protected same-origin route first.
- Coordinate the Turnstile secret rotation across **both** Workers because they share the current secret. Rotate Make.com webhook URLs using an overlapping, tested handoff. Do not invalidate an old working destination before the new integration is proven.
- Validate full business and residential pipelines in staging. Release them one at a time after explicit approval; monitor delivery and rollback without silently bypassing security.

**Gate 1:** Both live forms submit real test leads end-to-end; missing/replayed/expired tokens fail; logs redact PII; secrets are not source literals; monitoring and rollback tested. Never assert completion solely from a passing build.

## Phase 2 — Protect endpoints and confirm abuse limits

- Prefer a proxied route such as `https://business.suncoasttechsupport.net/api/contact` for the business form; confirm routing doesn't conflict with existing GitHub Pages paths or redirects. The residential domain and form must be evaluated separately.
- Add narrowly scoped Cloudflare WAF / rate-limit policy or Worker-side rate limiting to protect the endpoint receiving POSTs, not just the public HTML pages. Start conservatively to avoid blocking real customers.
- Only after both forms post via the protected paths and pass end-to-end tests, reduce or disable unwanted direct `workers.dev` exposure. Never disable the old endpoint first.
- Verify response headers, HTTPS, cross-origin behavior, and login/secrets permissions. Do not treat CORS or `Origin` checking as proof of human identity.

**Gate 2:** Direct bypass and high-volume tests are rejected, legitimate lead delivery remains reliable on desktop and mobile.

## Phase 3 — Turnstile-verified email reveal (independent feature)

Staged UI design: `feature/turnstile-email-reveal-design/security/email-reveal/README.md`. A locally tested **not deployed** Worker prototype has also been prepared for review in this project.

- Keep the Sales and Partners aliases stored as encrypted Worker secrets; publish no address in static HTML, scripts, hidden elements, metadata, or page source. Include older published articles **and all seven scheduled drafts** in the removal review.
- Replace direct `mailto:` references with accessible `Show Sales Email` / `Show Partner Email` controls and a fallback link to the contact form. Keep click-to-call visible.
- On visitor action, render Cloudflare Turnstile with `action=email_reveal`; send the single-use token and selected alias via same-origin POST to `/api/email-reveal`.
- Validate token with Siteverify **on the Worker** (success, hostname, expected action) before returning an email value with `Cache-Control: no-store`. Worker must reject incorrect path/host, missing env secrets, malformed requests and direct `workers.dev` use.
- Configure IP/traffic abuse limits **before going live**; no public `GET` endpoint exposing addresses. Test failure/retry and accessible keyboard/mobile behavior.
- Cloudflare tokens are single use and expire after five minutes; refresh challenges appropriately. Never log raw tokens or customer emails.
- Understand limits: a human can still reveal and republish an address, and previously indexed aliases may stay discoverable. This reduces easy harvesting, not all spam.

**Gate 3:** Static-source scan finds no exposed Sales/Partners emails on public or scheduled site assets; wrong tokens/hostnames fail; real visitor access works on mobile/desktop; contact-form and phone alternatives remain prominent. Owner approves live UI change.

## Phase 4 — Monitor, rollback and consider optional OTP later

- Observe contact form completion rate, successful sales/partner email reveals, Turnstile failures and false blocks. Review edge logs without collecting visitor PII unnecessarily.
- If lead conversions fall, first revert the email-reveal UI to frictionless contact-form access; preserve Phase 1 Worker hardening.
- If the form Worker cutover fails, restore the proven prior routing/configuration and webhook in a controlled, documented rollback. Do not reuse revoked credentials.
- The staged `feature/contact-email-otp` is a **separate optional business decision**. It increases friction and is not a prerequisite for protecting the form or email reveal. Decide whether it measurably improves lead quality before considering deployment.

## Release controls and ownership

| Release | Scope | Deployment gate | Rollback |
|---|---|---|---|
| R0 | Baseline test/backup | Read-only checks completed | N/A |
| R1a | Compatible business Worker hardening | Verified Make/Zoho lead + secret rotation plan | Restore prior known-good version and valid credentials |
| R1b | Residential Worker hardening | Independent residential submission test | Residential-specific rollback |
| R2 | Protected form routes + rate limits | Forms operate through new path, no bypass | Restore validated prior routes while keeping Turnstile checks |
| R3 | Verify-to-reveal email UI and dedicated Worker | Owner approval, cross-device tests, full static-address cleanup | Revert UI to contact form/contact channel |
| R4 | Monitoring and optional OTP decision | Lead data reviewed | Preserve hardened forms; optional OTP remains off |

**Production approvals needed:** each Worker deployment, secret rotation, new webhook, WAF/rate-limit rule, any route/DNS change, public email removal, and email-reveal activation. No implicit authorization from this staged planning document.

## Operational risks

- **Lead loss:** Any break between browser → Worker → Make.com → Zoho is unacceptable. Prove full pipeline at each gate.
- **Cross-site secret reuse:** Both Workers currently share a Turnstile secret. Coordinate before rotating.
- **Workers.dev bypass:** Cloudflare zone rules for `business.suncoasttechsupport.net` do not automatically cover `workers.dev`.
- **Legacy OTP branch:** Do not deploy its gateway-secret-enforcing Worker until an OTP gateway is live. Better: introduce non-OTP compatible hardening now and keep OTP optional.
- **Static address leakage:** Removing a header aria-label does not hide the address in `mailto:` or visible HTML; all copies must be removed for email reveal to matter.
- **Automated future publications:** The DigiCert and CISA queues must not reintroduce raw contact emails when the guarded email UI goes live.

## Relevant documentation

- Cloudflare Turnstile Siteverify: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Cloudflare Turnstile explicit rendering: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
- Cloudflare Workers secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Existing staged email OTP: `feature/contact-email-otp/worker/otp/README.md`
- Existing staged email reveal design: `feature/turnstile-email-reveal-design/security/email-reveal/README.md`
