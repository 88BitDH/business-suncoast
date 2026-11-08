# Suncoast Show Email — Production rollout and rollback

**Authorized action:** User requested “Implement this and review rollback if needed” on November 8, 2026.
**Scope:** Business `business.suncoasttechsupport.net` public Sales and Partners email links; NOT the separate residential site or existing business lead Worker/Make pipeline.

## Exact pre-release baseline

- Main branch before this release: `b87ff1b82c6ff90e1f5e2d16c0bc0b1494b566e7`. This includes the Google Ads conversion-label capitalization fix, updated mobile navigation and click-tracking.
- Existing business website origin: proxied CNAME to GitHub Pages.
- Existing four Cloudflare routes unchanged at preflight; no email-reveal route.
- New production Worker: `suncoast-email-reveal`, separate from `suncoast-lead-form` and residential Worker.
- New Cloudflare route (added as part of rollout): ID `8c46f91c0e7e4651b962fa50ca348568`, pattern `business.suncoasttechsupport.net/api/email-reveal*`, script `suncoast-email-reveal`.
- New Worker `workers.dev` is disabled.
- Worker bindings: encrypted `TURNSTILE_SECRET`, `SALES_EMAIL`, `PARTNERS_EMAIL`; ratelimit `EMAIL_REVEAL_LIMITER` namespace `8811082` at 12 calls per 60 seconds, approximate per location.
- Dedicated production Turnstile widget `Suncoast Verified Email Reveal - Staged`, configured only for `business.suncoasttechsupport.net`; client sitekey is public, **secret is Cloudflare-only**.

## Controlled production release order

1. Confirm release tests and latest `main` HEAD, then merge the release branch that preserves Google Ads conversion labels.
2. Confirm GitHub Pages successful deployment and inspect the homepage, contact section, About, Privacy and service pages for old hardcoded `mailto:` links.
3. Confirm the real business hostname renders a **Show Sales Email** / **Show Partners Email** button, not a raw address.
4. Complete new Turnstile challenges on the production hostname and verify the revealed addresses are the intended monitored business aliases. Use one token per test; don't repeatedly retry failures.
5. Confirm email links open correctly and the existing contact form still submits to `suncoast-lead-form`.
6. Patch the two scheduled article publication-source branches (six CISA queue items and one November 10 DigiCert alert) with the guarded email markup and latest mobile navigation. Do not silently alter article factual content.
7. Audit fresh live page responses, security posture, accessibility, and relevant contact analytics.

## Emergency rollback — preserve customer contact routes

**Preferred immediate response when dialog/API fails:** Do **NOT** restore the unprotected raw addresses by simply resetting `main` to its old commit. That would undo Google Ads tracking and expose emails again.

1. Keep `suncoast-lead-form` and the customer contact form, phone and text links untouched.
2. Replace the live `assets/email-reveal.js` contents with the staged `security/email-reveal/fallback-email-reveal.js` (**one-file emergency rollback**). All existing Show Email buttons redirect to `/#contact`, avoiding a broken modal.
3. After GitHub Pages publishes the fallback, confirm the live JS URL contains the fallback and test header/inline buttons, mobile and contact form. Because static assets may be cached, purge that single JS URL from Cloudflare cache if needed; if caching persists, update the query-string version on each page as a separately reviewed action.
4. If there is evidence the API itself is misbehaving/exposing data, remove **only** Cloudflare route ID `8c46f91c0e7e4651b962fa50ca348568` (verify route still points to `suncoast-email-reveal` first). Leave production lead Workers, remaining four routes, DNS, and Turnstile lead forms unchanged.
5. If old indexed assets or public articles re-expose addresses, apply guarded updates on the relevant publication branches; never delete unrelated alerts.
6. Document observed error and test recovery before restoring the protected dialog. Do not disable the existing contact form.

**Rollback verification:** Home and mobile Show Email actions open `/#contact`, phone and SMS work, business form posts successfully, existing Google Ads tracking labels are intact, no erroring modal, API route is removed if compromised. Confirm GitHub Pages deployment before considering rollback complete.

## Normal removal after successful rollback

- Keep unused email-reveal Worker configuration until the owner approves deletion or reinstatement.
- Do not rotate or delete the separate contact-form Turnstile key, Make webhook, or existing lead Worker in a Show Email rollback.
- A rate limit is approximate per Cloudflare datacenter; it is a friction mechanism, not an authorization barrier.
- Cloudflare validation and success on the earlier QA hostname do not prove production success; real production hostname challenge check required.

## Explicit boundaries

**Only** the verified Show Email rollout, associated new Worker and API route, 18 site pages, and queued article template updates are in scope. No unrelated DNS, WAF, TLS, email forwarding, Google Ads settings, residential website, or existing Make/Zoho workflow changes.
