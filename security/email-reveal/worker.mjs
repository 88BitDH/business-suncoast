/**
 * STAGED ONLY — not deployed, routed, or attached to production website.
 * Route after approval: POST https://business.suncoasttechsupport.net/api/email-reveal
 * Encrypted Worker secrets: TURNSTILE_SECRET, SALES_EMAIL, PARTNERS_EMAIL.
 * Required additional Workers Rate Limiting binding: EMAIL_REVEAL_LIMITER.
 * No email addresses or verification credentials belong in the GitHub repository.
 */
const ORIGIN = "https://business.suncoasttechsupport.net";
const HOSTNAME = "business.suncoasttechsupport.net";
const PATH = "/api/email-reveal";
const ACTION = "email_reveal";
const MAX_JSON_CHARS = 4096;
const commonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store, max-age=0",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Vary": "Origin",
};
const json = (status, value) => Response.json(value, { status, headers: commonHeaders });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Reject workers.dev and unexpected hostnames — Cloudflare zone security rules
    // do not automatically protect the workers.dev host.
    if (request.method !== "POST" || url.protocol !== "https:" ||
        url.hostname !== HOSTNAME || url.pathname !== PATH) {
      return json(404, { error: "Not found" });
    }
    // Origin check is a supplemental filter, not an authentication guarantee.
    if (request.headers.get("Origin") !== ORIGIN) {
      return json(403, { error: "Request rejected" });
    }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("Content-Type") || "")) {
      return json(415, { error: "Unsupported content type" });
    }
    if (!env?.TURNSTILE_SECRET || !env?.SALES_EMAIL || !env?.PARTNERS_EMAIL ||
        typeof env?.EMAIL_REVEAL_LIMITER?.limit !== "function") {
      return json(503, { error: "Service temporarily unavailable" });
    }
    let body;
    try {
      if (Number(request.headers.get("Content-Length") || 0) > MAX_JSON_CHARS) {
        return json(413, { error: "Request too large" });
      }
      const raw = await request.text();
      if (raw.length > MAX_JSON_CHARS) return json(413, { error: "Request too large" });
      body = JSON.parse(raw);
    } catch {
      return json(400, { error: "Invalid request" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        !["sales", "partners"].includes(body.mailbox) ||
        typeof body.token !== "string" ||
        body.token.length < 1 || body.token.length > 2048) {
      return json(400, { error: "Invalid verification details" });
    }
    // Fail closed on limiter errors; low thresholds require real-user testing.
    let allowed;
    try {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const result = await env.EMAIL_REVEAL_LIMITER.limit({ key: ip + ":" + body.mailbox });
      allowed = result?.success === true;
    } catch {
      return json(503, { error: "Service temporarily unavailable" });
    }
    if (!allowed) return json(429, { error: "Too many requests" });

    let result;
    try {
      const verified = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: new URLSearchParams({
          secret: env.TURNSTILE_SECRET,
          response: body.token,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!verified.ok) return json(503, { error: "Verification unavailable" });
      result = await verified.json();
    } catch {
      return json(503, { error: "Verification unavailable" });
    }
    // Siteverify tokens are single-use and expire in five minutes.
    // The matching action prevents borrowing a token from the contact form.
    if (result?.success !== true || result.hostname !== HOSTNAME || result.action !== ACTION) {
      return json(403, { error: "Verification failed" });
    }
    return json(200, {
      email: body.mailbox === "sales" ? env.SALES_EMAIL : env.PARTNERS_EMAIL
    });
  }
};
