# Security review and staged replacement for suncoast-lead-form

## Current production behavior (from supplied source)
- Public URL: suncoast-lead-form.iammoeskicova0808.workers.dev
- POST fields: name, email, phone, help, lead_source, page_name,
  utm_source, utm_campaign, utm_term, utm_medium, landing_page,
  cf-turnstile-response.
- The existing Worker calls Cloudflare Turnstile Siteverify.
- It then POSTs a JSON object to a Make.com webhook with keys:
  name, email, phone, help, source, page_name, utm_source,
  utm_campaign, utm_term, utm_medium, landing_page.
- It redirects to /thank-you.html (302) on success.
- There was no email ownership verification or gateway authentication.
- The original code contained a plaintext Turnstile secret and a
  live Make.com webhook URL. These values were NOT copied into GitHub.

## Staged replacement
See index.js (NOT deployed). It:
1. Rejects all direct unauthenticated POSTs with HTTP 403 by requiring
   X-Suncoast-OTP-Gateway-Secret matching the server-side encrypted secret.
2. Rejects missing or malformed lead details before delivering to Make.
3. Still validates the SECOND, fresh Turnstile token on the final submission.
4. Checks Turnstile response hostname against business.suncoasttechsupport.net.
5. Posts the SAME payload field names to Make.com.
6. Preserves success redirect and HTML error responses.
7. Stops logging customer PII and webhook response bodies.
8. Uses env bindings, not hardcoded credentials.

## Required Cloudflare Secret bindings
Create the following on the *existing* suncoast-lead-form Worker:
- TURNSTILE_SECRET: NEW rotated secret corresponding to the site's widget.
- MAKE_WEBHOOK_URL: NEW rotated/recreated Make.com webhook URL.
- LEAD_GATEWAY_SECRET: random shared secret >= 32 characters, SAME value
  as the separate OTP gateway Worker, NEVER present on the website.

Use Workers & Pages > suncoast-lead-form > Settings >
Variables and Secrets > Add > Type: Secret.
Do NOT paste any secret values in ChatGPT, GitHub, website JavaScript, or screenshots.

## Important credential rotation and downtime precaution
Both the original Turnstile secret and Make webhook URL were disclosed in
the source review conversation. Treat them as compromised; rotate/recreate.

Cloudflare Turnstile can retain its old secret for up to two hours during
normal rotation (unless invalidated immediately); use this grace period
to update all Workers sharing the widget/sitekey. The B2C Worker
suncoast-b2c-lead-form must be inspected for use of the same widget key:
DO NOT assume the business Worker is the only consumer.

Make.com webhooks are URL-addressed triggers. Replace the exposed endpoint
with a NEW webhook URL and verify its scenario mappings before disabling
the old one. Swapping a webhook can interrupt leads if not coordinated.

## Cutover with minimal disruption
A. Back up the exact deployed Worker source and capture existing settings.
B. Rotate the exposed Turnstile secret with grace and coordinate all sites
   using the widget; stage the new secret on each relevant Worker.
C. Create a new Make webhook and test its exact 11-key JSON payload
   and downstream lead routing. Keep the old workflow until cutover.
D. Deploy and test the OTP gateway/D1/Resend using the existing Worker
   or a separate staging clone (prefer staging for automated testing).
E. Configure and test a fresh Turnstile token at final submission.
F. Configure the production form to use the OTP gateway endpoint.
   Verify several real test leads arrive and tracking/redirect works.
G. Immediately deploy the secured replacement legacy Worker with
   LEAD_GATEWAY_SECRET enforcement and fresh secrets, and confirm that
   direct requests now return HTTP 403 while gateway requests succeed.
H. Deactivate the exposed Make webhook as soon as the new pipeline works.
I. Monitor real-lead delivery after cutover and retain tested rollback code
   and recovery contacts (Sales email and phone). A rollback that removes
   the gateway secret check reopens the OTP bypass; use only as a short,
   deliberate emergency mitigation with monitoring.

## Tests
The automated test suite test.mjs covers:
- Direct bypass attempts rejected before Turnstile or Make.
- Valid lead JSON payload keys/values and 302 redirect preserved.
- Failed Turnstile / wrong hostname rejected.
- Make webhook errors fail closed.
- Missing name/email/token rejected.
- Missing authorization configuration rejected.

Run with Node.js 22+:
  node --test test.mjs

## Remaining production verification
Cloudflare dashboard runtime, Resend sender DNS, Make scenario execution, and
Zoho notifications cannot be tested using the GitHub repository alone.
Successful unit tests are NOT evidence of live delivery or account setup.

## Scope
Email OTP confirms inbox access for FORM submissions only.
Direct mailto links (Sales@ and Partners@) are ordinary emails and cannot
be forced through a web-form OTP without a different inbound mail policy.
