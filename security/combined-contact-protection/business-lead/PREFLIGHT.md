# Hardened business lead Worker — predeployment validation

**Checked:** 2026-11-07 | **Status:** STAGED — NOT PRODUCTION-READY YET

## Verified in this session

| Item | Evidence | Result |
|---|---|---|
| Staged Worker behavior | 20 offline Node tests with simulated Siteverify and Make responses | PASS |
| Live site source contract | 7 additional offline checks over all 21 existing static HTML pages | PASS |
| Total regression suite | GitHub Actions run 42411076514 | **27 passed, 0 failed** |
| Business lead forms | Nine current pages have POSTs to the existing workers.dev business endpoint and Turnstile widget | Verified |
| Customer review form | Keeps rating and publication consent in the message payload | Verified in source and unit tests |
| FTC Safeguards form | Does not have `help`, which is optional in hardened Worker | Verified |
| Widget configuration | Cloudflare widget “Suncoast Lead Form” allows `business.suncoasttechsupport.net` and `suncoasttechsupport.net`; mode = managed | GET verification |
| Server-side hostname | Staged Worker checks `Siteverify.success === true` and exact business hostname | Verified in code/tests |
| Existing Make flow | B01 and B01-RETEST completed successfully after fixing Gmail recipient mapping; queue cleared | Verified in Make |
| Current deployed Worker bindings | Business and residential Workers have no encrypted secret bindings | Confirmed via read-only Cloudflare GET |
| Current Worker subdomains | Both have public workers.dev endpoints enabled | Confirmed via read-only Cloudflare GET |
| Main branch | GitHub `main` remained on commit `f289c920506e6a11eb74e2d2ebafdda0639a70e2` | Unchanged |

## Existing pages covered by the site contract tests

1. `/`
2. `/services/`
3. `/it-support/`
4. `/managed-it/`
5. `/microsoft-365/`
6. `/office-networking/`
7. `/business-security.html`
8. `/wisp-compliance/`
9. `/reviews/`

Do not require email OTP or gateway-specific authentication in the initial business Worker replacement. The browser posts forms directly today.

## Blocking gates before any production deployment

- [ ] **Separate staging Worker** running the candidate code under a distinct name, without changing the existing `suncoast-lead-form`.
- [ ] A **nonproduction Make webhook/scenario** (or an explicit, controlled live-inquiry plan) so test calls cannot be mistaken for genuine customer leads.
- [ ] Test-only encrypted Worker secrets for `TURNSTILE_SECRET` and `MAKE_WEBHOOK_URL`; no plaintext in GitHub, chat, test logs, or pages.
- [ ] An interactive Turnstile challenge rendered on an allowed hostname; verify that its real token is accepted and the correct `hostname` is returned by Siteverify.
- [ ] End-to-end test of a new Worker that confirms Make/Zoho delivery and 302 redirect, not just HTTP 200 from a webhook.
- [ ] Negative runtime tests for omitted, expired, replayed, and wrong-hostname Turnstile tokens, and a webhook error.
- [ ] Exact backup of current deployed production Worker and its non-secret settings. Keep a tested rollback.
- [ ] Coordinate **business and residential** Turnstile key/secret rotation (the live Workers previously shared a hardcoded secret). Never invalidate the old secret until every consumer is updated and tested.
- [ ] Test mapping and downstream delivery for any **new Make webhook URL** before retiring the old one.
- [ ] Owner explicitly approves **each production cutover** after evidence and rollback are reviewed.

## Not included in this phase

- No production Worker source, account secrets, DNS, route, or WAF rule changed.
- No end-to-end submissions were generated in this test session.
- No access to a real Turnstile challenge token was requested.
- No changes to business or residential forms.
- No live CAPTCHA/email-reveal deployment; that remains a separate gated phase.
- No Worker-level rate-limiting implemented yet. Public workers.dev exposure remains; endpoint protection is planned for a follow-on release.

## Lowest-risk execution order

1. Configure an isolated staging Worker and test Make delivery, after explicit authorization and an agreed test path.
2. Verify real Turnstile challenge success and failure in that staging Worker.
3. Confirm no false failure for the nine website forms and Make's actual 11-field schema.
4. Coordinate secret rotation with both live Workers and obtain production deployment approval.
5. Deploy business Worker alone, validate a real baseline lead, and observe before addressing residential Worker and endpoint routing.

**Do not confuse passing local CI with production readiness.**

Evidence: https://github.com/88BitDH/business-suncoast/actions/runs/42411076514
