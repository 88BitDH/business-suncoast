# Staged design — CAPTCHA-verified "Show Email" (NOT LIVE)

Status: proposal/prototype only. This branch is not the GitHub Pages publishing branch. No Cloudflare Worker, route, secret, contact form, or live page has been modified.

## Goal and business constraints

Reduce routine harvesting of the business site's Sales and Partners email aliases, while retaining easy ways for genuine prospects to get help. Keep the phone number publicly click-to-call. Preserve the existing business lead form; never require registration just to make contact. This feature must be approved and tested before deployment.

**Honest limitations:** Even a server-side challenge cannot stop a human or a determined bot-solver from learning an address, and the address may already be widely indexed. The solution raises the effort required for casual scraping. No phone number obfuscation is proposed.

## User experience

1. Header envelope control and Sales / Partners contact links become accessible `button` elements labeled "Show Sales Email" / "Show Partner Email".
2. On click, display a small in-page Turnstile verification panel. An accessible alternative remains: use the contact form or call/text (727) 647-9000.
3. After successful Turnstile completion, a client script POSTs the token and requested alias ("sales" or "partners") to a same-origin endpoint at `/api/email-reveal`.
4. If verified, the Worker returns the address once as JSON with `Cache-Control: no-store`. The frontend creates a visible `mailto:` link and focuses it. Never embed the address in HTML or static JavaScript.
5. On failure, expired token, network interruption or JS-disabled browsers, show a friendly retry and the contact-form/phone alternatives. Never lock out the entire site.

## Backend security architecture

- Deploy a dedicated Cloudflare Worker **only after approval**, routed on `business.suncoasttechsupport.net/api/email-reveal`. The business subdomain is already Cloudflare-proxied. Block unwanted `workers.dev` public access where the current Worker setup permits.
- Configure encrypted Worker secrets: `TURNSTILE_SECRET`, `SALES_EMAIL`, and `PARTNERS_EMAIL`. Do NOT commit them to GitHub. The email itself must not appear in site HTML, source JavaScript, or metadata.
- The Worker accepts same-origin `POST` with JSON body `{ token, mailbox }` only; reject invalid shape and unexpected Origin. Origin alone is not a security boundary.
- Validate `token` with Cloudflare Siteverify on **every** request and reject unsuccessful, expired, repeated, mismatched hostname (`business.suncoasttechsupport.net`), or wrong `action` (`email_reveal`). Siteverify tokens expire after five minutes and are single use.
- No permissive CORS, no-store responses, no logging of email addresses or submitted tokens. Apply rate limiting/challenge to this path once real traffic is observed, and monitor abuse.
- Keep existing contact form Worker, Turnstile and Make/Zoho integration unchanged. A separate endpoint avoids interrupting leads.

## Rollout checklist (requires new approval)

1. Review which plain email instances, mailto links, accessibility labels, and inline scripts remain across **all business pages**, including articles and scheduled drafts. Remove addresses from every public site asset, not only the header.
2. Confirm whether the current `mailto:` header icon should be replaced by the CAPTCHA button or link to `/#contact` as the safer fallback.
3. Create or validate a Turnstile widget authorized for `business.suncoasttechsupport.net`, with the `email_reveal` action, and store its secret securely.
4. Deploy and test the Worker on an isolated route; test valid, absent, malformed, replayed, expired, cross-origin and wrong-action tokens; verify no other URLs are intercepted.
5. Deploy the static JS and accessible UI in a staging environment. Confirm phone, contact form and other menu links work on desktop/mobile and keyboard/screen reader.
6. Obtain approval for **live** changes, then update header/contact links, remove **all** unprotected addresses from site assets, and activate the route. Verify Cloudflare, GitHub Pages and site analytics after rollout.
7. Ensure published articles and scheduled publishing jobs do not reintroduce raw addresses.
8. Monitor legitimate email clicks and contact-form inquiries. Reverse the UI if the extra barrier materially reduces inquiries.

## Tradeoffs

| Option | Advantages | Risks |
| --- | --- | --- |
| Keep direct mailto | Frictionless, best for inquiries | Harvestable, already publicly listed |
| Existing Cloudflare email obfuscation | Works without a challenge; already enabled | Doesn't guarantee protection for attributes, source repositories or advanced scrapers |
| Turnstile reveal via Worker | Hides address from initial HTML/JS and filters routine bots | Slower email access; extra endpoint, monitoring and deployment work |
| Registration/login before email | Stronger identity gate | Excessive sales friction; stores accounts and creates more risk |

Recommendation: try Cloudflare obfuscation + secure form first; use a staged Turnstile reveal if sales email spam remains a problem. Do not put the phone behind a CAPTCHA.

Cloudflare docs:
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
- https://developers.cloudflare.com/workers/configuration/secrets/
