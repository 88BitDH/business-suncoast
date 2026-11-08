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

const revealCore = {
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

const QA_HOSTNAME = "suncoast-email-reveal-qa-20261108.iammoeskicova0808.workers.dev";
const QA_HTML = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<meta name=\"robots\" content=\"noindex,nofollow,noarchive\">\n<title>Suncoast — Verified Email QA</title>\n<link rel=\"stylesheet\" href=\"/assets/email-reveal.css\">\n<style>\n*{box-sizing:border-box}\nbody{margin:0;background:#f2f6f9;color:#193a4d;font:16px/1.55 Arial,Helvetica,sans-serif}\n.sc-header{background:#0c3957;color:white;padding:14px 20px}\n.sc-header nav{display:flex;align-items:center;gap:14px;max-width:820px;margin:auto;flex-wrap:wrap}\n.sc-header .sc-social{display:inline-flex;align-items:center;gap:8px}\n.sc-header strong{margin-right:auto;font-size:18px}\nmain{max-width:760px;margin:24px auto;padding:28px;background:#fff;border-radius:14px;box-shadow:0 6px 24px #0c395718}\nh1{font-size:clamp(22px,4vw,30px);line-height:1.25;margin:0 0 12px}\nh2{font-size:20px}\n.notice{padding:12px 16px;background:#fff7de;border-radius:8px;border-left:4px solid #d98310}\n.actions{display:flex;align-items:center;flex-wrap:wrap;gap:14px;margin:18px 0}\n.qa-action{border:1px solid #b5cfdf;background:#f5fbff;border-radius:8px;padding:12px 14px;min-height:44px}\na{color:#0a638a}a:focus-visible,button:focus-visible{outline:3px solid #f58220;outline-offset:3px}\n@media(max-width:600px){main{margin:12px;padding:18px}.sc-header{padding:10px}.sc-header nav{gap:8px}.qa-action{width:100%;text-align:left}}\n</style>\n<!-- Reproduce the case where a normal contact page already loads Turnstile. -->\n<script src=\"https://challenges.cloudflare.com/turnstile/v0/api.js\" async defer></script>\n</head>\n<body>\n<header class=\"sc-header\">\n<nav aria-label=\"QA navigation\">\n<strong>Suncoast Tech Support · QA Only</strong>\n<div class=\"sc-social\">\n<button type=\"button\" class=\"sc-email-trigger\" data-email-reveal=\"sales\" aria-label=\"Show Sales email after verification\" title=\"Show Sales Email\">\n<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"m3.5 7 8.5 6 8.5-6\"/></svg>\n</button>\n</div>\n</nav>\n</header>\n<main>\n<h1>Verified Show Email — desktop and mobile test</h1>\n<p class=\"notice\"><strong>TEST ONLY:</strong> A successful verification reveals synthetic <code>example.test</code> addresses. No real customer or business email address is served here.</p>\n<p>Test the envelope icon in the header and the two Show Email controls below. Each should open the same accessible Cloudflare verification dialog.</p>\n<div class=\"actions\">\n<div class=\"qa-action\"><button type=\"button\" class=\"sc-email-inline\" data-email-reveal=\"sales\">Show Sales Email</button></div>\n<div class=\"qa-action\"><button type=\"button\" class=\"sc-email-inline\" data-email-reveal=\"partners\">Show Partners Email</button></div>\n</div>\n<p>Confirm that the dialog works on a narrow mobile screen, that its <strong>Close</strong> button and Escape key dismiss it, and that keyboard focus returns to the original Show Email button.</p>\n<p>For real inquiries, <a href=\"https://business.suncoasttechsupport.net/#contact\">use the business contact form</a> or <a href=\"tel:17276479000\">call (727) 647-9000</a>.</p>\n<p><small>No Make.com, Zoho, lead notification, or customer messaging workflow is connected to this page.</small></p>\n</main>\n<script src=\"/assets/email-reveal.js\" defer></script>\n</body></html>";
const QA_CLIENT = "/* Suncoast verified email reveal: staged feature, not deployed to production.\n * Address values are NEVER embedded in static files. A verified, one-time\n * Turnstile token is validated server-side before the Worker returns an alias.\n */\n(() => {\n  \"use strict\";\n  const SITEKEY = \"0x4AAAAAAF4ubrYcqJYpCexy\"; // Public Cloudflare sitekey, NOT a secret.\n  const ENDPOINT = \"/api/email-reveal\";\n  const API_SCRIPT = \"https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit\";\n  const SELECTOR = \"[data-email-reveal]\";\n  let active = null;\n  let scriptPromise = null;\n\n  function challengeApi() {\n    if (window.turnstile && typeof window.turnstile.render === \"function\") {\n      return Promise.resolve(window.turnstile);\n    }\n    if (scriptPromise) return scriptPromise;\n    scriptPromise = new Promise((resolve, reject) => {\n      const existing = document.querySelector('script[src*=\"challenges.cloudflare.com/turnstile/v0/api.js\"]');\n      if (!existing) {\n        const script = document.createElement(\"script\");\n        script.src = API_SCRIPT;\n        script.async = true;\n        script.defer = true;\n        script.onload = () => {\n          if (window.turnstile && typeof window.turnstile.render === \"function\") resolve(window.turnstile);\n          else reject(new Error(\"Turnstile was not initialized\"));\n        };\n        script.onerror = () => reject(new Error(\"Turnstile script could not load\"));\n        document.head.appendChild(script);\n      } else {\n        // Some pages already load Turnstile for their existing contact form.\n        // Wait for that script rather than loading the API a second time.\n        let checks = 0;\n        const interval = window.setInterval(() => {\n          if (window.turnstile && typeof window.turnstile.render === \"function\") {\n            window.clearInterval(interval);\n            resolve(window.turnstile);\n          } else if (++checks >= 100) {\n            window.clearInterval(interval);\n            reject(new Error(\"Turnstile initialization timed out\"));\n          }\n        }, 100);\n      }\n    }).catch(err => {\n      scriptPromise = null;\n      throw err;\n    });\n    return scriptPromise;\n  }\n\n  function setStatus(state, text) {\n    if (!active || active !== state) return;\n    state.status.textContent = text;\n  }\n  function close() {\n    const state = active;\n    if (!state) return;\n    active = null;\n    state.modal.remove();\n    if (state.widgetId !== null && window.turnstile && window.turnstile.remove) {\n      try { window.turnstile.remove(state.widgetId); } catch (_) { /* best effort */ }\n    }\n    document.removeEventListener(\"keydown\", state.keydown);\n    if (state.trigger && state.trigger.isConnected) state.trigger.focus();\n  }\n  function open(mailbox, trigger) {\n    if (![\"sales\", \"partners\"].includes(mailbox)) return;\n    if (active) close();\n    const modal = document.createElement(\"div\");\n    modal.className = \"sc-email-shade\";\n    modal.innerHTML =\n      '<section class=\"sc-email-panel\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"sc-email-heading\">' +\n      '<button type=\"button\" class=\"sc-email-close\" aria-label=\"Close email verification\">×</button>' +\n      '<h2 id=\"sc-email-heading\">Show ' + (mailbox === \"sales\" ? \"Sales\" : \"Partners\") + ' email</h2>' +\n      '<p>Complete this security check to reveal our email address. No account is required.</p>' +\n      '<div class=\"sc-email-challenge\"></div>' +\n      '<p class=\"sc-email-status\" role=\"status\" aria-live=\"polite\">Loading security check…</p>' +\n      '<div class=\"sc-email-result\" hidden></div>' +\n      '<p class=\"sc-email-alternatives\">Prefer not to verify? ' +\n      '<a href=\"https://business.suncoasttechsupport.net/#contact\">Use our contact form</a> or ' +\n      '<a href=\"tel:17276479000\">call (727) 647-9000</a>.</p>' +\n      '</section>';\n    const state = {\n      modal,\n      trigger,\n      widgetId: null,\n      status: modal.querySelector(\".sc-email-status\"),\n      result: modal.querySelector(\".sc-email-result\"),\n      keydown: event => {\n        if (event.key === \"Escape\") close();\n        if (event.key === \"Tab\") {\n          const controls = [...modal.querySelectorAll(\"button,a,[tabindex]:not([tabindex='-1'])\")]\n            .filter(el => !el.disabled && el.getClientRects().length);\n          if (!controls.length) return;\n          const first = controls[0], last = controls[controls.length - 1];\n          if (event.shiftKey && document.activeElement === first) {\n            last.focus(); event.preventDefault();\n          } else if (!event.shiftKey && document.activeElement === last) {\n            first.focus(); event.preventDefault();\n          }\n        }\n      }\n    };\n    active = state;\n    modal.querySelector(\".sc-email-close\").addEventListener(\"click\", close);\n    modal.addEventListener(\"click\", event => { if (event.target === modal) close(); });\n    document.body.appendChild(modal);\n    document.addEventListener(\"keydown\", state.keydown);\n    modal.querySelector(\".sc-email-close\").focus();\n    challengeApi().then(api => {\n      if (active !== state) return;\n      setStatus(state, \"Complete the verification to show the address.\");\n      state.widgetId = api.render(modal.querySelector(\".sc-email-challenge\"), {\n        sitekey: SITEKEY,\n        action: \"email_reveal\",\n        appearance: \"always\",\n        execution: \"render\",\n        callback: token => reveal(state, mailbox, token),\n        \"error-callback\": () => setStatus(state, \"Verification could not load. Try again, or use the contact form.\"),\n        \"expired-callback\": () => setStatus(state, \"Your check expired. Please complete a fresh check.\"),\n        \"timeout-callback\": () => setStatus(state, \"Verification timed out. Please try again.\")\n      });\n    }).catch(() => setStatus(state, \"Security check unavailable. Please use the contact form or call us.\"));\n  }\n\n  async function reveal(state, mailbox, token) {\n    if (active !== state) return;\n    setStatus(state, \"Checking verification…\");\n    try {\n      const response = await fetch(ENDPOINT, {\n        method: \"POST\",\n        mode: \"same-origin\",\n        credentials: \"same-origin\",\n        cache: \"no-store\",\n        referrerPolicy: \"no-referrer\",\n        headers: { \"Content-Type\": \"application/json\" },\n        body: JSON.stringify({ mailbox, token })\n      });\n      if (active !== state) return;\n      if (!response.ok) throw new Error(\"Verification rejected or service unavailable\");\n      const data = await response.json();\n      if (typeof data.email !== \"string\" || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(data.email)) {\n        throw new Error(\"Unexpected response\");\n      }\n      const link = document.createElement(\"a\");\n      link.href = \"mailto:\" + data.email;\n      link.textContent = data.email;\n      state.result.replaceChildren(link);\n      state.result.hidden = false;\n      setStatus(state, \"Email address verified. Select the address to open your email app.\");\n      link.focus();\n    } catch (_) {\n      if (active !== state) return;\n      setStatus(state, \"Could not reveal email right now. Please use the contact form or phone.\");\n      if (window.turnstile && state.widgetId !== null) {\n        try { window.turnstile.reset(state.widgetId); } catch (_) { /* best effort */ }\n      }\n    }\n  }\n\n  document.addEventListener(\"click\", event => {\n    const trigger = event.target.closest(SELECTOR);\n    if (!trigger || trigger.disabled) return;\n    event.preventDefault();\n    open(trigger.dataset.emailReveal, trigger);\n  });\n})();\n";
const QA_CSS = "/* Staged email-reveal controls, scoped so existing header/menu styles remain unchanged. */\n.sc-header .sc-social button.sc-email-trigger {\n  appearance:none; -webkit-appearance:none; box-sizing:border-box;\n  width:39px; height:39px; min-width:39px; margin:0; padding:0;\n  display:inline-flex; align-items:center; justify-content:center;\n  border:0; border-radius:8px; background:transparent; color:inherit;\n  font:inherit; cursor:pointer; transition:background .15s ease;\n}\n.sc-header .sc-social button.sc-email-trigger:hover {background:#ffffff33}\n.sc-header .sc-social button.sc-email-trigger:focus-visible,\nbutton.sc-email-inline:focus-visible {\n  outline:3px solid #ffa746!important; outline-offset:3px;\n}\n.sc-header .sc-social button.sc-email-trigger svg {width:21px;height:21px;display:block}\nbutton.sc-email-inline {\n  display:inline; appearance:none; -webkit-appearance:none;\n  margin:0; padding:0; color:inherit; background:none;\n  border:0; border-radius:2px; text-decoration:underline;\n  text-underline-offset:3px; font:inherit; cursor:pointer;\n}\nbutton.sc-email-inline:hover {text-decoration-thickness:2px}\n.sc-email-shade {position:fixed;inset:0;z-index:100000;display:grid;\n  place-items:center; overflow:auto; padding:16px;\n  background:rgba(3,21,34,.74)}\n.sc-email-panel {position:relative; width:min(100%,490px);max-height:calc(100dvh - 32px);\n  overflow:auto;box-sizing:border-box;padding:30px 24px;border-radius:14px;\n  background:#fff;color:#1b3140;box-shadow:0 20px 70px #071a2a7a;\n  font:16px/1.55 Arial,Helvetica,sans-serif;text-align:left}\n.sc-email-panel h2{margin:0 36px 10px 0;font-size:23px;line-height:1.25;color:#0c3957}\n.sc-email-panel p{margin:12px 0}\n.sc-email-panel a{color:#075e88!important;text-decoration:underline!important}\n.sc-email-panel a:focus-visible{outline:3px solid #f58220;outline-offset:3px}\n.sc-email-close{position:absolute;right:12px;top:12px;display:inline-flex;\n  align-items:center;justify-content:center;width:42px;height:42px;\n  border:0;border-radius:8px;color:#11354c;background:#e9f1f5;\n  font-size:28px;cursor:pointer}\n.sc-email-close:focus-visible{outline:3px solid #f58220}\n.sc-email-challenge{min-height:64px;margin:18px 0 8px}\n.sc-email-status{font-size:14px;color:#334f62}\n.sc-email-result{background:#edf7f8;border:1px solid #b1d6db;border-radius:8px;\n  margin:14px 0;padding:12px 14px;overflow-wrap:anywhere;font-weight:700}\n.sc-email-alternatives{font-size:14px;color:#405866}\n@media(max-width:600px){\n  .sc-header .sc-social button.sc-email-trigger{width:37px;min-width:37px;height:37px}\n  .sc-email-panel{padding:26px 16px}\n}\n@media(max-width:400px){\n  .sc-header .sc-social button.sc-email-trigger{width:35px;min-width:35px;height:35px}\n}\n@media(prefers-reduced-motion:reduce){\n  .sc-header .sc-social button.sc-email-trigger{transition:none}\n}\n";
const QA_HEADERS = {"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff"};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol !== "https:" || url.hostname !== QA_HOSTNAME) return new Response("Not found",{status:404});
    if (request.method === "GET" && (url.pathname === "/qa" || url.pathname === "/")) {
      return new Response(QA_HTML,{status:200,headers:{"Content-Type":"text/html; charset=utf-8",...QA_HEADERS}});
    }
    if (request.method === "GET" && url.pathname === "/assets/email-reveal.js") {
      return new Response(QA_CLIENT,{status:200,headers:{"Content-Type":"application/javascript; charset=utf-8",...QA_HEADERS}});
    }
    if (request.method === "GET" && url.pathname === "/assets/email-reveal.css") {
      return new Response(QA_CSS,{status:200,headers:{"Content-Type":"text/css; charset=utf-8",...QA_HEADERS}});
    }
    if (request.method === "POST" && url.pathname === "/api/email-reveal") {
      return revealCore.fetch(request, env);
    }
    return new Response("Not found",{status:404,headers:QA_HEADERS});
  }
};
