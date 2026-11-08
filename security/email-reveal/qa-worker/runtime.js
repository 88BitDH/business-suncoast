/**
 * STAGED ONLY — not deployed, routed, or attached to production website.
 * Route after approval: POST https://business.suncoasttechsupport.net/api/email-reveal
 * Encrypted Worker secrets: TURNSTILE_SECRET, SALES_EMAIL, PARTNERS_EMAIL.
 * Required additional Workers Rate Limiting binding: EMAIL_REVEAL_LIMITER.
 * No email addresses or verification credentials belong in the GitHub repository.
 */
const ORIGIN = "https://suncoast-email-reveal-qa-20261108.iammoeskicova0808.workers.dev";
const HOSTNAME = "suncoast-email-reveal-qa-20261108.iammoeskicova0808.workers.dev";
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

const securedReveal = {
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


const QA_HOST = "suncoast-email-reveal-qa-20261108.iammoeskicova0808.workers.dev";
const PAGE = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex,nofollow,noarchive\"><title>Suncoast verified-email QA</title><style>body{font:16px/1.6 system-ui,sans-serif;background:#edf2f6;padding:2rem;color:#183d52}main{max-width:600px;margin:0 auto;background:white;border-radius:16px;padding:24px}label{display:block;padding:4px}fieldset{border:1px solid #ccc;border-radius:8px;margin:1rem 0}button{padding:12px;border-radius:8px}#result{font-weight:600;overflow-wrap:anywhere}a{color:#075d88}</style><script>async function qaVerified(token){const r=document.getElementById('result');r.textContent='Verifying…';try{const mailbox=document.querySelector('input[name=mailbox]:checked').value;const response=await fetch('/api/email-reveal',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({mailbox,token})});const data=await response.json();if(response.ok&&typeof data.email==='string'){const a=document.createElement('a');a.href='mailto:'+data.email;a.textContent=data.email;r.replaceChildren(a);}else{r.textContent='Verification failed (HTTP '+response.status+'). Reload and try again.';}}catch(e){r.textContent='Security check unavailable. Reload or try later.';}}</script><script src=\"https://challenges.cloudflare.com/turnstile/v0/api.js\" async defer></script></head><body><main><h1>Suncoast email reveal — QA</h1><p><strong>Test only:</strong> successful verification reveals synthetic addresses ending in example.test, not real business emails. No customer data is used or sent.</p><fieldset><legend>Choose address to test</legend><label><input type=\"radio\" name=\"mailbox\" value=\"sales\" checked> Sales</label><label><input type=\"radio\" name=\"mailbox\" value=\"partners\"> Partners</label></fieldset><div class=\"cf-turnstile\" data-sitekey=\"0x4AAAAAAF4ubrYcqJYpCexy\" data-action=\"email_reveal\" data-callback=\"qaVerified\"></div><p id=\"result\" role=\"status\" aria-live=\"polite\">Complete the security check to reveal a test address.</p><p>For real support, use the <a href=\"https://business.suncoasttechsupport.net/#contact\">business contact form</a> or call <a href=\"tel:17276479000\">(727) 647-9000</a>.</p></main></body></html>";
const PAGE_HEADERS = {"Cache-Control":"private, no-store","Content-Type":"text/html; charset=utf-8","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex,nofollow"};
export default {async fetch(request, env) {
  const url = new URL(request.url);
  if (url.protocol !== "https:" || url.hostname !== QA_HOST) return new Response("Not found",{status:404});
  if (request.method === "GET" && (url.pathname === "/qa" || url.pathname === "/")) return new Response(PAGE,{status:200,headers:PAGE_HEADERS});
  if (request.method === "POST" && url.pathname === "/api/email-reveal") return securedReveal.fetch(request, env);
  return new Response("Not found",{status:404,headers:PAGE_HEADERS});
}};