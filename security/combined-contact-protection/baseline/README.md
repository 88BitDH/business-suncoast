# Baseline lead-delivery test — Suncoast Tech Support
**Prepared:** 2026-11-07 | **Status:** READY FOR CONTROLLED EXECUTION, NOT EXECUTED

## Purpose

Record the existing customer-facing behavior **before** replacing any Cloudflare Worker or rotating secrets. This is a real end-to-end delivery test: web form → Turnstile → current Cloudflare Worker → Make.com webhook/scenario → Zoho lead/ticket/email → website thank-you page. A 302 or visible thank-you page alone is **not** sufficient evidence that Make.com/Zoho received the inquiry.

## Production status (read-only verification)

- Public business website: `https://business.suncoasttechsupport.net/`.
- Business form action currently: `https://suncoast-lead-form.iammoeskicova0808.workers.dev/`.
- Current business and residential Workers both have `workers.dev` enabled.
- The production Workers currently have no configured secret bindings; both embed the existing Turnstile credential and Make webhook URL in deployed source. Do not copy these values to this public GitHub repo.
- Current business forms were checked in GitHub main: homepage, `/reviews/`, and `/wisp-compliance/` all use the business Worker.
- Existing staged hardened replacement (NOT DEPLOYED): `../business-lead/index.js` with 20 passing mocked tests.
- Cloudflare Turnstile sitekey is present on inspected forms. Real Siteverify success, Make scenario execution and Zoho receipt **have not been independently tested by this checklist**.

## Ground rules and credentials

1. Obtain permission to perform the actual controlled live test before submitting. Preparing this checklist is not permission to send live inquiries.
2. The operator chooses and controls a test mailbox and knows how to verify receipts in Make.com and Zoho. Do not use a customer's real name/contact details.
3. Use a clear unique marker such as `SCQA-20261107-B01` and name `Suncoast QA Test B01`. Avoid paid ad landing URLs during tests. Actual submissions may be counted by Google conversion analytics; annotate/filter QA events where feasible.
4. Do not log or publish secret keys, Make webhook URLs, full customer form payloads, real email addresses or personal details into GitHub, chat, or screenshots.
5. Record only the timestamp, test reference, result, platform event/record identifiers and sanitized notes in the private test log (blank template below).
6. Run the first one business lead only; **stop and investigate immediately** if it does not appear in the expected Make.com scenario and Zoho destination. Do not run other positive tests or change Workers while baseline fails.
7. Test the residential Worker separately, using its actual current residential form URL and owner-approved test mailbox. Do not assume business and residential confirmations share the same downstream destination.

## Execution plan and expected results

| Step / ID | Source | Input distinguishing the test | Client-side expectation | Backend expectation |
|---|---|---|---|---|
| 0 | Browser | Normal fresh browser, not coming from paid ad | Current form loads; Turnstile renders; phone/contact controls work | No unsolicited Make event |
| B01 | `/` | Use test-controlled name/email; help `SCQA-20261107-B01 baseline inquiry` | Turnstile completes and form takes visitor to `/thank-you.html` | Exactly one expected Make webhook execution and matching Zoho lead/ticket/email with marker |
| B02 | `/services/` | `SCQA-20261107-B02`; different page name | Valid success redirect | Source/page fields preserved; one matching backend lead |
| B03 | `/wisp-compliance/` | Name `Suncoast QA Test B03` (this form does not supply `help`) | Valid success redirect | Make and Zoho receive expected name and page name with missing help handled safely |
| B04 | `/reviews/` | `SCQA-20261107-B04` in review text, with rating/consent clearly marked QA | Form submits and thank-you appears | Make and Zoho have one feedback item; rating and consent retained in `help`; test review NOT automatically published |
| B05 | Business homepage | Submit without completing Turnstile | User sees security failure/retry; no success redirect | No Make/Zoho lead |
| B06 | Business homepage | Repeat an already-redeemed Turnstile token (non-production harness only) | 403 security failure | No Make/Zoho lead; do **not** reuse a live customer's token |
| R01 | Residential form | Separate owner-approved test ID `SCQA-20261107-R01` | Residential success/thanks behavior as originally implemented | Corresponding residential Make/Zoho destination receives one lead, without cross-site misrouting |
| 7 | Review | Compare B01–B04, R01 with Make scenario executions, Zoho records and receipt emails | No live disruptions | All deliveries and mappings reconciled by unique ID |

**Do not execute all cases blindly.** B01 is the gate for the others. B05 can be checked without a delivery; B06 is preferably tested with mocked tokens in staging to avoid production interference.

## Field contract and acceptance gates

The business Worker currently forwards exactly 11 JSON keys to Make:

`name`, `email`, `phone`, `help`, `source`, `page_name`, `utm_source`, `utm_campaign`, `utm_term`, `utm_medium`, `landing_page`.

The customer review page formats a rating and publication-contact consent into the `help` field before form submission, and the WISP page omits `help`. These are required compatibility cases. The replacement must preserve the current 302 redirect to `https://business.suncoasttechsupport.net/thank-you.html`.

**Baseline passes only if:**
- Each approved positive test produces a matched, unique event in Make AND the correct Zoho destination; use source ID/reference and timestamp, not just a visible 302.
- Marketing attribution/UTM fields and source are not lost where supplied.
- A failed CAPTCHA never creates a lead and provides a recovery option.
- No unintended duplicate tickets or published customer reviews.
- Site and Worker remain on current production configuration.

## Evidence capture (private, not GitHub)

Copy the blank template `baseline-results-template.csv` to a private working location to fill in with:
- Test ID; timestamp in America/New_York; test page; browser receipt/redirect (PASS/FAIL); Turnstile result (PASS/FAIL); Make execution ID and state; Zoho record/ticket ID; notification receipt; duplicate count; investigator notes.
- Keep test account addresses and real customer data out of the shared results.
- Redact any webhook URLs, Turnstile secrets, account tokens or request payloads in screenshots.

## What happens next (separate approval)

1. Review the completed baseline evidence.
2. Clone the hardened Worker in non-production; configure *test* encrypted secrets and a safe Make scenario; verify Siteverify hostname and real integration without touching production.
3. Prepare a joint B2B/B2C Turnstile secret rotation and new Make webhook handoff. Rotate only after both workflows are tested.
4. Request separate explicit approval for each production Worker change. Keep direct production forms intact until cutover validation.

## Links

- <https://business.suncoasttechsupport.net/>
- <https://business.suncoasttechsupport.net/services/>
- <https://business.suncoasttechsupport.net/wisp-compliance/>
- <https://business.suncoasttechsupport.net/reviews/>
- Existing Worker and tests: `../business-lead/README.md`
- Combined security plan: `../README.md`
