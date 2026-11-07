# Suncoast Make.com lead-flow failure alerts — design only

**Date:** 2026-11-07
**Status:** NOT DEPLOYED; no changes to Make.com scenario, notification preferences, monitoring, or Cloudflare.
**Scenario:** Make “Integration Webhooks” ID `4618097`, team `2097094`; instant webhook, currently active.
**Purpose:** Detect and correct failed lead handling quickly, without suppressing errors, duplicate customer acknowledgments, or publishing submitted contact details.

## Observed baseline

- The scenario is `CustomWebHook (#1) -> SMTP lead notification (#2) -> Sleep 180 seconds (#5) -> Gmail acknowledgment (#6)`.
- Gmail `to` was corrected from `{{1.name}}` to `{{1.email}}`; both queued B01 test executions later succeeded and queue count reached 0.
- When Gmail's recipient was invalid, the run failed with `BundleValidationError`, and the instant-webhook scenario automatically entered an error/deactivated state.
- No error-handler branch exists in the observed current blueprint.
- Its Gmail module error does **not** establish that the lead notification was lost; SMTP had already completed. However, it stopped new immediate processing until reactivation.
- The *current personal Make email notification preferences* have **not been read or changed**; the available scenario tools cannot confirm whether the account holder receives native notifications.
- The final step is customer acknowledgment, not Zoho Desk ticket creation. Do not claim that this scenario creates a Zoho record without separate evidence.

## Phase A — Native Make notifications (low risk, first)

1. In Make, open **Profile -> Email preferences -> Organizations -> My Organization**.
2. Confirm **Errors**, **Deactivation** and **Warnings** are all enabled for the account that will monitor Suncoast leads; confirm which inbox receives these messages and whether mailbox filters can deliver them.
3. Ensure alerts are not diverted to spam or an unmonitored folder, and mark them high priority in the recipient inbox. Make defaults to error and deactivation notifications, but verify actual preferences instead of assuming.
4. Make normally sends an initial email immediately for errors or warnings and sends follow-up digests (after 5 minutes for errors and 15 minutes for warnings). **This is Make's documented behavior, not a verified notification delivery in this account.**
5. Make no changes to the production webhook flow while enabling/verifying notification preferences.

Official docs: https://help.make.com/manage-your-email-preferences

## Phase B — Independent watchdog (design only)

Use a separate scheduled monitor that does **not** rely on the same Make scenario's SMTP/Gmail chain. If implementing through ChatGPT Automations, verify the scheduled task can read the connected Make scenario and issue the intended notification before enabling it.

- **Suggested cadence:** every 15 minutes, configurable after real-world testing.
- **Scope:** specific scenario `4618097`, not all of Make.
- **Critical signal 1:** scenario `status` becomes `error`, `inactive` or `paused`, unexpectedly, or a known connection becomes `missing`.
- **Critical signal 2:** new `error` execution since previous successful check.
- **Warning signal:** webhook queued count remains nonzero across consecutive checks for more than 10 minutes. The built-in 180-second sleep can make short queues normal, so **do not page on any nonzero queue immediately**.
- **Do not infer a failure solely from no new leads**: website traffic is intermittent.
- **Deduplication:** one alert per new failed execution or distinct outage; repeat once after a longer unresolved interval, not every 15 minutes.
- **Recovery:** send one `RECOVERED` message when status returns to active, no new errors, and the stuck queue clears.
- **Alert payload:** status, scenario ID/name, occurrence time Eastern, execution ID, module ID/name, queue count, Make scenario link, and recommended next action. No lead name/email/phone, request body, webhook URL or secret.
- **Health-monitor failure:** notify separately if monitoring itself cannot authenticate/query Make; don't claim the scenario is healthy if the monitor is unavailable.

## Phase C — Error preservation (requires separate signoff)

1. Consider Make **Store incomplete executions** for recoverable downstream delivery failures; evaluate data-retention/privacy and plan limits first. These stored executions can include customer information.
2. Avoid adding `Skip` or `Resume` on Gmail without understanding consequences: they may mark a run successful even if no acknowledgment was sent.
3. Don't blindly auto-retry a `BundleValidationError` (mapping/data error); it will fail again without correction. A transient SMTP/network error is different.
4. Be cautious with the **Retry** error handler; decide whether it retries the exact failed final step and cannot resend an internal notification. Verify duplicate-suppression semantics before activation.
5. Do not remove or shorten the 180-second sleep as part of alerting work. Review separately for business responsiveness.

Official docs:
- https://help.make.com/Overview-of-error-handling
- https://help.make.com/incomplete-executions
- https://help.make.com/scenario-settings

## Incident response workflow

1. **ALERT:** Check scenario status, last failed execution, failing module, and queue count in Make.
2. **TRIAGE:** Is the customer's lead already in the internal notification inbox? If yes, customer acknowledgment may be the only missed action. If no, contact directly through a safe fallback.
3. **FIX:** Correct a mapping or credential issue without exposing PII. Verify all dependencies before reactivating.
4. **RESUME:** If scenario was deactivated, reactivate only when fixed. Queue processing could send delayed customer emails; review queued payloads for duplicate/real customer impact before doing so.
5. **VERIFY:** Check at least one genuine test run succeeds end-to-end and the queue clears. Verify customer acknowledgment in the controlled test inbox.
6. **RECORD:** Write the incident, root cause, and result to a private operational ticket; avoid storing lead contents in a public GitHub repository.

## Approval boundaries

- This document approves **nothing** automatically.
- Native Make personal notification preferences must be checked by the account owner, or with a connector that specifically supports that setting (the current available scenario tools do not).
- Do not patch scenario `4618097` error handlers, settings or recipients; do not create independent monitoring or send alert messages until explicitly approved.
- Do not replay failed B01 runs, turn off running scenarios, or resubmit test leads simply to test an alert.

## Success criteria

- Correct monitor inbox demonstrably receives an intentionally generated *safe noncustomer* failure alert, without breaking the current scenario or sending duplicate customer acknowledgments.
- Incident alerts include enough context to fix errors while disclosing no customer PII.
- A 15-minute monitor detects deactivation or stuck queues as a backup; alert rate is low and failures are deduplicated.
- Existing lead flow remains on, and all known successful steps are unchanged.
