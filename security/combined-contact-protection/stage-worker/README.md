# Isolated Suncoast business lead Worker — staging environment

**Prepared:** 2026-11-07
**Status:** QA Worker **deployed separately**, Make QA scenario **created but inactive** (account active-scenario limit). No production forms, Workers, DNS or mail scenarios changed. **Do not mistake this for an end-to-end production pass.**

## Resources created

| Resource | Identifier | Purpose |
|---|---|---|
| Cloudflare Worker | `suncoast-lead-form-qa-20261107` | Isolated copy of the hardened business lead Worker, with synthetic-only QA form |
| QA form | `https://suncoast-lead-form-qa-20261107.iammoeskicova0808.workers.dev/qa` | Human test page for genuine Turnstile tokens |
| Turnstile widget | `Suncoast QA Lead Worker 2026-11-07` | Separate `managed` widget restricted to the exact QA Worker hostname |
| Public sitekey (not a secret) | `0x4AAAAAAF33SThXCtZCseqm` | Embedded in staging form only |
| Make QA scenario | `6945633`: `Suncoast QA — Isolated Lead Worker Test (no customer email)` | Independent webhook receiver with no outbound email or Zoho modules |
| Cloudflare secrets | `TURNSTILE_SECRET`, `MAKE_WEBHOOK_URL` | Both set as encrypted `secret_text` bindings on the **QA Worker only** |

**QA Make webhook URL and Turnstile secret are not in this repository.** The widget secret was read from the newly created QA widget and written directly to the QA Worker as a Cloudflare encrypted binding. The Make webhook was likewise installed only as a secret binding.

## Tests completed

1. GitHub Actions staging run `42411907231`: **37 offline tests passed**, 0 failed: original hardened Worker (20), website contract over nine existing forms (7), isolated QA Worker (10).
2. Cloudflare API confirms one QA Worker deployment, the expected account Workers subdomain, QA widget hostname, and both encrypted bindings.
3. The QA Worker is available via `workers.dev`; preview URLs are disabled. No production routes point to it.
4. Make scenario `6945633` was created separately with only a generic webhook trigger, no customer email or Zoho modules.
5. Make **refused activation** of the QA scenario: `Maximum number of active scenarios has been exceeded`. Both existing production scenarios remain active. Do not deactivate either merely to free a slot.
6. No live HTTP request from a browser to the QA Worker or QA webhook has yet been completed. External tooling here could not independently GET the workers.dev URL; this is a verification limitation, not proof the endpoint is down.

## Synthetic-only access policy

The QA form is accessible only at `/qa` with the public staging host; `/` returns 404. It POSTs to `/submit` and validates:
- `name` must equal `Suncoast QA`
- `email` must equal `qa@example.test` (non-deliverable test domain)
- `help` must begin `SCQA-STAGE-`
- A valid real Turnstile response must be verified for the staging hostname before forwarding.

Requests with actual customer data fail before Make. The success redirect targets `/qa/success` on the same staging hostname, not the production website. A successful redirect **only indicates HTTP acceptance by the Make QA webhook**, not completion of an inactive scenario.

## Safe browser smoke test (operator)

1. Visit `https://suncoast-lead-form-qa-20261107.iammoeskicova0808.workers.dev/qa`. Do not use a client name/email.
2. Confirm the page says `TEST ONLY`, name `Suncoast QA`, email `qa@example.test`, and a message starting `SCQA-STAGE-`.
3. Complete the Cloudflare Turnstile challenge and click **Submit isolated test** **once**.
4. Expected browser result: `/qa/success`. If you see a 403 or 503 page, record the error and stop; do not resubmit repeatedly.
5. Read Make scenario `6945633` → webhook inspection. **Because the scenario is inactive**, the submission may appear as a **queued** webhook delivery; do not expect a completed execution. Check that queued count changes and the payload contains exactly 11 fields, all synthetic.
6. An inactive QA scenario has no customer acknowledgments or Zoho routing. This smoke test must not be used as production approval.

## Blocker for the complete Make execution test

The Make team already has two active scenarios:
- `4618097` Integration Webhooks (business)
- `4806354` Integration Webhooks (separate integration)

The account rejected activation of scenario `6945633` due to the active scenario limit. Choose one of the following **only with explicit owner approval**:
- Provide a higher active-scenario limit through Make, then activate QA temporarily for test and deactivate QA after completing.
- Temporarily disable an existing active scenario only during an owner-approved low-activity window with verified rollback and customer communications; **not recommended** because it could interrupt leads.
- Leave QA inactive and validate webhook queue receipt only; complete the Make processing test later.

Never route staging test payloads into live Make webhooks or change production forms to point to the QA Worker just to bypass this limit.

## What still has to be done before production

- Browser smoke test with genuine staging Turnstile token and confirmation of QA webhook receipt.
- Completed Make QA execution (blocked by active scenario limit).
- Test failure cases in real Worker runtime (invalid, expired, reused tokens, Make error), safely and without customer data.
- Preserve production Worker code and settings; coordinate Turnstile secret rotation across both business and residential Workers and Make webhook migration.
- Separate approval before any production Worker deployment or WAF/route change.

## References

- Production-safe hardening preflight: `../business-lead/PREFLIGHT.md`
- Cloudflare Turnstile hostname rules: https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/
- Cloudflare Turnstile test keys: https://developers.cloudflare.com/turnstile/troubleshooting/testing/
- Cloudflare Workers secrets: https://developers.cloudflare.com/workers/configuration/secrets/
