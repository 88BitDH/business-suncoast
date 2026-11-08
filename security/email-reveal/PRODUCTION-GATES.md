# Suncoast Verified Email Reveal — Production Safeguards and QA Result

**Prepared:** 2026-11-08 (America/New_York)
**Status:** SAFEGUARDS STAGED ONLY. DO NOT DEPLOY TO PRODUCTION WITHOUT NEW APPROVAL.

## Part W — Browser QA verification

**User-confirmed PASS, earlier synthetic QA page:** The user selected the shortcut **“Both test addresses appeared”** on November 8, confirming that `sales@example.test` and `partners@example.test` were revealed after Cloudflare verification on the **original simplified QA page**. This is the user's reported browser result, not a telemetry-derived finding.

**New full-modal QA page deployed — browser verification still PENDING.** The isolated Worker `suncoast-email-reveal-qa-20261108` now serves the actual staged Show Email JavaScript and CSS, a header email icon, Sales and Partners links, and a preloaded Turnstile script. Four encrypted/rate-limit bindings were preserved on upload with strict inheritance. The production site and Workers remain unchanged.

- QA browser link: `https://suncoast-email-reveal-qa-20261108.iammoeskicova0808.workers.dev/qa`.
- Confirm the modal appears for Sales, Partners and the header envelope, reveals the two synthetic aliases only after a fresh token, closes with Escape and its Close button, restores focus, and fits on a phone.
- Cloudflare telemetry was not conclusive in the previous check; never claim independent log confirmation of the original run.
- Browser automation and screen-reader testing remain separate sign-off gates.

**Do not deploy production until the full-modal browser tests are confirmed, privacy wording reviewed, and release explicitly approved.**

## Part D — Production release prerequisites

### Current Cloudflare conditions (read-only verified)

- Business host `business.suncoasttechsupport.net` has a **proxied CNAME**, with GitHub Pages as the static site origin.
- Current Worker routes are four unrelated redirect routes (`/compliance*`, `/it-services*`, `/cybersecurity*`, plus `suncoasttechsupport.net/*`); **no conflicting `/api/email-reveal` route exists**.
- The suggested production Worker name `suncoast-email-reveal` is unused.
- The production email-reveal managed widget (separate from business contact-form widget) allows only `business.suncoasttechsupport.net`; its **public** sitekey is `0x4AAAAAAF4tQwhQiUBOGQe0`.
- There is **no production email-reveal Worker deployed or routed**. Do not assume the staging UI can work on the live site yet.
- Existing lead Workers' secret migration and `workers.dev` exposure must be handled as separate sign-off items; do not combine cutovers.

### Required production Worker configuration — design only

See `release-plan.json` for the machine-readable **non-executable** release manifest.

| Element | Proposed value / behavior |
| --- | --- |
| Worker | `suncoast-email-reveal` (new, separate from lead Workers) |
| Source | `security/email-reveal/worker.mjs` |
| Target host/path | exact `business.suncoasttechsupport.net/api/email-reveal` |
| Allowed method | `POST` only (other methods rejected) |
| `workers.dev` | **disabled** in production |
| `TURNSTILE_SECRET` | Encrypted secret from **production** email-reveal widget, not the QA widget |
| `SALES_EMAIL`, `PARTNERS_EMAIL` | Encrypted, validated actual monitored mailboxes. Never write their values into GitHub code or release logs |
| `EMAIL_REVEAL_LIMITER` | Separate ratelimit namespace (proposed `8811082`), initial 12 calls/60 seconds, tune for real users |
| Turnstile acceptance | Requires `success=true`, hostname exactly `business.suncoasttechsupport.net`, and action `email_reveal` |
| Response | JSON address only after verification, `Cache-Control: no-store`, no CORS relaxation |
| Telemetry | Privacy-safe invocation/error status; never log token, visitor IP, or address |
| Route origin | Proxied business CNAME; avoid changing site origin, DNS, redirect Workers or WAF |
| Observability | Enable status-only/limited logging and sampled traces after review |

## 10-stage release and rollback order

1. **Verify** the newly deployed **full modal** with actual Cloudflare Turnstile tokens on desktop and mobile (the earlier simplified QA page was user-confirmed passed). Record both synthetic reveals and keyboard/focus behavior before any production change.
2. **Review** the Privacy Policy modification and accessible interface. Do not inadvertently redirect privacy complaints to an unmonitored Sales mailbox.
3. **Freeze** the exact current `main` commit, current production site deployment, Cloudflare Worker route inventory, and existing Mail/Make workflow behavior. Re-run GitHub comparison against `main` before merge.
4. **Prepare** a separate production Worker with the production widget secret and real alias secrets in encrypted Cloudflare bindings only; disable public `workers.dev`. Do not modify existing live lead Workers.
5. **Attach** the exact business-host `/api/email-reveal` route only after independent approval; ensure non-target paths still reach GitHub Pages.
6. **Test** the API with a genuine fresh Turnstile token minted on the authorized business hostname, and verify failure cases: missing token, replay/expiration, wrong hostname/action, rate limit, and Siteverify unavailability.
7. **Release** the 18 protected business HTML pages, `assets/email-reveal.js`, and `assets/email-reveal.css` as a coordinated publishing action only after successful API validation. Confirm mobile nav and call/text links still work.
8. **Coordinate** both article-publishing automation sources (CISA queue and November 10 DigiCert article). Apply protected seven-article templates before publishing any queued page; otherwise old headers can re-expose mail addresses and drop latest mobile-nav code.
9. **Monitor** actual reveal success, HTTP 403/429/503 counts, and whether lead conversion/calls decrease due to CAPTCHA friction; adjust rate limits after legitimate-user testing.
10. **Rollback safely** if reveal fails: keep the phone/text and existing contact forms available and replace unavailable Show Email actions with working `/#contact` links. **Do not restore raw email addresses or disable lead Workers** as the initial rollback. Revert only the email-reveal route and assets after isolating risk. Require approval for any production rollback change.

## Automated protection now staged

- The original 48 offline tests for the API, synthetic QA Worker, bad tokens, and all 18 pages remain.
- Four extra regression gates check that mobile menu and phone-click tracking from the **November 8 production update** survive on all 18 pages, that the seven queued article templates use the latest shell assets, that production config names and bindings match code, and that the Worker fails closed.
- **52/52 tests passing**, GitHub Actions `42486538731`: https://github.com/88BitDH/business-suncoast/actions/runs/42486538731
- `main` had commit `c981a8f9c61401816e69f314c59a5b36dfc0ab67` when release planning started. **Recheck before deployment** because ongoing site work can update it.

## Project boundaries

- Staging branch: `feature/verified-email-reveal-latest-2026-11-08`.
- No merge of staged page code into `main`.
- No production Worker upload, route change, DNS change, mail workflow change or production Turnstile secret rotation.
- Scheduled article publisher branches remain unchanged by this preparation.
- No actual customer personal data used for QA.
- These safeguards are an actionable plan, not authorization to deploy.
