# Suncoast business contact form — email OTP

## Status
IMPLEMENTED IN A FEATURE BRANCH. NOT LIVE. This package does not replace or overwrite
the currently running Cloudflare lead Worker. The page's data-otp-api attribute is
intentionally blank until the new gateway is deployed and verified. No secrets are committed.

## How it works
1. Visitor enters their email and passes the existing Cloudflare Turnstile challenge.
2. /start validates the Turnstile token at Cloudflare's Siteverify endpoint, limits
   abusive requests, sends a six-digit one-time code through Resend, and stores only
   a keyed hash of the code in Cloudflare D1.
3. /verify enforces five attempts, a 10-minute code lifetime, and provides a
   20-minute random bearer proof bound to the same email.
4. /submit atomically consumes the proof, checks that the email matches, and relays
   the original form fields to the EXISTING lead Worker.
5. The original lead Worker should validate a fresh, second Turnstile token at
   submission. The browser resets the Turnstile widget after /start for this reason.

## Setup checklist (Cloudflare account owner required)
- Use a verified Resend sending domain or subdomain (suggested:
  notify.suncoasttechsupport.com). Do not replace or remove existing Zoho SPF,
  DKIM, DMARC or MX records. Configure only the DNS records explicitly required
  for the selected sending subdomain.
- Create a Resend API key. Keep it secret.
- In Cloudflare, confirm the existing Turnstile widget sitekey belongs to
  business.suncoasttechsupport.net. Obtain the secret key for that sitekey.
- Install Node.js, then run 'npm install -g wrangler' (or use npx wrangler).
- Run 'npx wrangler login'.
- From this directory, run 'npx wrangler d1 create suncoast-contact-otp'.
- Copy the returned database_id into wrangler.toml.
- Run 'npx wrangler d1 execute suncoast-contact-otp --remote --file=./schema.sql'.
- Run 'npx wrangler secret put TURNSTILE_SECRET' and supply the existing
  Turnstile secret.
- Run 'npx wrangler secret put RESEND_API_KEY' and supply the Resend API key.
- Run 'npx wrangler secret put OTP_SECRET' and supply a separate random secret
  of at least 32 characters (prefer 64 hexadecimal characters).
- Run 'npx wrangler deploy'. Copy its HTTPS workers.dev URL.
- On the website branch, configure that URL in index.html by setting the
  lead-otp.js script's 'data-otp-api' attribute. Do NOT enable before tests.

## Test before activating
- Using a real email inbox, send a code; check Resend event logs.
- Verify a wrong code fails and correct code succeeds; check expiration,
  five-attempt lockout, resend throttling, and email-change behavior.
- Submit the form and confirm the EXACT original lead flow (Zoho routing,
  notification contents, UTM fields, and thank-you redirect/tracking) still works.
- Verify the original lead Worker accepts gateway-forwarded POSTs. If it depends
  on Referrer, origin, IP address, or content type, it may need adjustments.
- Verify a fresh Turnstile response is accepted by the original Worker;
  Turnstile responses are single-use.
- Test on mobile and desktop, and test browser failure/slow-network cases.
- Once verified, activate on main. Do not activate in this feature branch alone.

## Security limitations that must be addressed before claiming all leads verified
THE ORIGINAL LEAD WORKER IS STILL PUBLICLY ACCESSIBLE. The gateway requires OTP
for form traffic passing through it, but attackers can bypass the gateway by
posting directly to the old Worker. To enforce email verification for ALL new
inquiries, change the old Worker to reject unauthenticated direct submissions
(e.g. require a separate shared gateway secret header known only to the two
Workers, never to the browser), or consolidate delivery into this gateway.
That change requires the old Worker's code/configuration, which was not available
through the connected repository. Do not disable the old Worker prematurely.
Also, an OTP confirms inbox access, not whether the sender represents a real
company or is trustworthy.

## Operational notes
- The gateway's 'submit' route forwards to the existing Worker; a 2xx or 3xx
  reply is treated as success. Test the actual upstream response contract.
- A transport timeout may mean delivery is uncertain, so the proof is not
  reused after such an error (avoids accidental duplicate leads).
- OTP codes and proofs are hashed using an HMAC key; no plaintext OTP codes
  are persisted. Avoid storing or logging mail contents or raw user input.
- Rate limits are based on hashed email/IP and time buckets; they are basic
  anti-abuse controls, not substitutes for Cloudflare's edge rate limiting.
- Implement scheduled pruning of expired otp_challenges and otp_limits rows as
  part of production operation. D1 does not automatically delete these rows.
- For operational security, restrict who can view Resend email event logs.
