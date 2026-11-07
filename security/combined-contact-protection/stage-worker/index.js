// ISOLATED QA COPY. ONLY use with the separate Make QA webhook. NEVER point live forms here.
// NOT DEPLOYED. Keep current native HTML forms, Make payload and 302 thank-you redirect.
// No email OTP or gateway credential required. Turnstile verification is still mandatory.
// Required encrypted bindings: TURNSTILE_SECRET, MAKE_WEBHOOK_URL.
// Do not place secret values or actual webhook URLs in source control.
// Rate limiting and protected same-origin routing are separately gated future phases.
const FORM_URL = "https://suncoast-lead-form-qa-20261107.iammoeskicova0808.workers.dev/qa";
const THANK_YOU_URL = "https://suncoast-lead-form-qa-20261107.iammoeskicova0808.workers.dev/qa/success";
const FORM_HOSTNAME = "suncoast-lead-form-qa-20261107.iammoeskicova0808.workers.dev";
const PHONE = "(727) 647-9000";
const MAX_REQUEST_BYTES = 16000;

function htmlMessage(title, message, status = 200) {
  const body = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + title + '</title><style>' +
    'body{font-family:Arial,sans-serif;padding:40px;text-align:center}' +
    '.box{max-width:500px;margin:auto}.btn{display:inline-block;padding:12px 20px;' +
    'background:#f58220;color:white;text-decoration:none;border-radius:8px;margin-top:20px}' +
    '</style></head><body><div class="box"><h1>' + title + '</h1><p>' + message +
    '</p><a class="btn" href="' + FORM_URL + '">Go Back</a>' +
    '<p style="margin-top:15px;">Need help? Call ' + PHONE + '</p></div></body></html>';
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function field(formData, key, maxLength, fallback = "") {
  const value = formData.get(key);
  if (value !== null && typeof value !== "string") return null;
  const result = value === null ? fallback : value.trim();
  return result.length <= maxLength ? result : null;
}

function validWebhook(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      /^hook\.[a-z0-9-]+\.make\.com$/.test(url.hostname) &&
      url.pathname.length > 2 &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}

async function validateTurnstile(token, env) {
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET,
      response: token
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("Turnstile Siteverify unavailable");
  const outcome = await response.json();
  return outcome.success === true && outcome.hostname === FORM_HOSTNAME;
}

const leadCore = {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
    }
    // Preserve existing direct browser submissions while the OTP gateway remains off.
    // Do NOT enable the OTP-gateway secret check until that entire workflow is live.
    if (!env.TURNSTILE_SECRET || !env.MAKE_WEBHOOK_URL || !validWebhook(env.MAKE_WEBHOOK_URL)) {
      console.error("Business lead Worker configuration missing or invalid");
      return htmlMessage("Service Unavailable", "Please call or text " + PHONE + " for help.", 503);
    }
    // Browser forms use urlencoded or multipart FormData. Reject other payload types.
    const contentType = request.headers.get("content-type") || "";
    if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)(?:;|$)/i.test(contentType)) {
      return htmlMessage("Invalid Request", "Please submit using the website contact form.", 415);
    }
    const lengthHeader = request.headers.get("content-length");
    if (lengthHeader !== null) {
      const declared = Number(lengthHeader);
      if (!Number.isSafeInteger(declared) || declared < 0 || declared > MAX_REQUEST_BYTES) {
        return htmlMessage("Request Too Large", "Please shorten your message and try again.", 413);
      }
    }
    // Measure actual streamed bytes too: clients may omit or forge Content-Length.
    if (request.body) {
      try {
        const reader = request.clone().body.getReader();
        let total = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value?.byteLength || 0;
          if (total > MAX_REQUEST_BYTES) {
            void reader.cancel().catch(() => {});
            return htmlMessage("Request Too Large", "Please shorten your message and try again.", 413);
          }
        }
      } catch {
        return htmlMessage("Invalid Request", "Please return to the form and try again.", 400);
      }
    }
    let formData;
    try {
      formData = await request.formData();
    } catch {
      return htmlMessage("Invalid Request", "Please return to the form and try again.", 400);
    }
    // Preserve the existing payload contract consumed by Make.com.
    const fields = {
      name: field(formData, "name", 160),
      email: field(formData, "email", 254),
      phone: field(formData, "phone", 100),
      help: field(formData, "help", 5000),
      source: field(formData, "lead_source", 150, "Suncoast B2B Landing Page"),
      page_name: field(formData, "page_name", 160),
      utm_source: field(formData, "utm_source", 180),
      utm_campaign: field(formData, "utm_campaign", 180),
      utm_term: field(formData, "utm_term", 180),
      utm_medium: field(formData, "utm_medium", 180),
      landing_page: field(formData, "landing_page", 2000)
    };
    if (Object.values(fields).some(x => x === null) ||
        !fields.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
      return htmlMessage("Invalid Request", "Please check the contact details and try again.", 400);
    }
    const token = String(formData.get("cf-turnstile-response") || "");
    if (!token || token.length > 2048) {
      return htmlMessage("Complete the Security Check",
        "Please check the 'Verify you are human' box and submit again.", 400);
    }
    let verified;
    try {
      verified = await validateTurnstile(token, env);
    } catch (error) {
      console.error("Turnstile service failure:", error?.name || "Error");
      return htmlMessage("Verification Unavailable",
        "The security check is temporarily unavailable. Please try again or call us.", 503);
    }
    if (!verified) {
      return htmlMessage("Verification Failed",
        "Please complete the security check again and resubmit.", 403);
    }
    try {
      const response = await fetch(env.MAKE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
        signal: AbortSignal.timeout(15000)
      });
      // Never log lead PII or the webhook response body.
      console.log("Business lead webhook HTTP status:", response.status);
      if (!response.ok) {
        return htmlMessage("We could not send your request",
          "Your form was verified, but there was a problem delivering your request. Please call or text " + PHONE + ".", 500);
      }
    } catch (error) {
      console.error("Business lead webhook delivery failed:", error?.name || "Error");
      return htmlMessage("We could not send your request",
        "Your form was verified, but there was a problem delivering your request. Please call or text " + PHONE + ".", 500);
    }
    return Response.redirect(THANK_YOU_URL, 302);
  }
};


const QA_HOSTNAME = "suncoast-lead-form-qa-20261107.iammoeskicova0808.workers.dev";
const QA_PAGE = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex,nofollow,noarchive\"><title>Suncoast QA: Lead Worker (Test Only)</title><style>body{font-family:system-ui,sans-serif;margin:1rem auto;max-width:38rem;padding:1rem;line-height:1.5;background:#f5f7fb}main{background:white;padding:1.5rem;border-radius:1rem}label{display:block;margin:.75rem 0}input,textarea{display:block;box-sizing:border-box;width:100%;padding:.6rem;font:inherit}button{background:#14486f;color:white;padding:.75rem 1rem;border:0;border-radius:.5rem;font:inherit;cursor:pointer}.warning{font-weight:600;color:#8a3f00}</style><script src=\"https://challenges.cloudflare.com/turnstile/v0/api.js\" async defer></script></head><body><main><h1>Suncoast contact Worker — isolated QA</h1><p class=\"warning\">TEST ONLY. This page does not send customer acknowledgments or create Zoho tickets. Do not use real customer information.</p><form method=\"POST\" action=\"/submit\"><label>Name<input name=\"name\" value=\"Suncoast QA\" required maxlength=\"160\"></label><label>Email (non-deliverable example.test)<input name=\"email\" type=\"email\" value=\"qa@example.test\" required></label><label>Phone (optional)<input name=\"phone\" value=\"\"></label><label>Test message<textarea name=\"help\" required>SCQA-STAGE-20261107 — isolated Worker test</textarea></label><input type=\"hidden\" name=\"lead_source\" value=\"Suncoast Stage QA\"><input type=\"hidden\" name=\"page_name\" value=\"Cloudflare Isolated QA Form\"><input type=\"hidden\" name=\"utm_source\" value=\"qa\"><input type=\"hidden\" name=\"utm_campaign\" value=\"stage-worker-20261107\"><input type=\"hidden\" name=\"utm_term\" value=\"\"><input type=\"hidden\" name=\"utm_medium\" value=\"test\"><input type=\"hidden\" name=\"landing_page\" value=\"https://suncoast-lead-form-qa-20261107.iammoeskicova0808.workers.dev/qa\"><div class=\"cf-turnstile\" data-sitekey=\"0x4AAAAAAF33SThXCtZCseqm\" data-size=\"normal\"></div><p><button type=\"submit\">Submit isolated test</button></p></form><p>Only the separate Suncoast QA Make webhook receives this test.</p></main></body></html>";
const QA_SUCCESS = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex,nofollow\"><title>QA submission accepted</title></head><body><h1>QA submission accepted by staging Worker</h1><p>This confirms only the Worker-to-Make webhook HTTP acceptance. Inspect the separate Make QA scenario execution for delivery confirmation.</p></body></html>";
const QA_HEADERS = {"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"};
export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    if (url.hostname !== QA_HOSTNAME || url.protocol !== "https:") return new Response("Not found", {status:404});
    if (request.method==="GET" && url.pathname==="/qa") return new Response(QA_PAGE,{status:200,headers:QA_HEADERS});
    if (request.method==="GET" && url.pathname==="/qa/success") return new Response(QA_SUCCESS,{status:200,headers:QA_HEADERS});
    if (request.method==="POST" && url.pathname==="/submit") {
      // Test-only guard: fail closed if an accidental real customer payload is supplied.
      let f;
      try {f=await request.clone().formData();} catch {return new Response("Test payload required",{status:400});}
      const email=f.get("email"), name=f.get("name"), message=f.get("help");
      if (email!=="qa@example.test" || name!=="Suncoast QA" ||
          typeof message!=="string" || !message.startsWith("SCQA-STAGE-")) {
        return new Response("Only synthetic QA submissions are allowed",{status:403});
      }
      return leadCore.fetch(request,env);
    }
    return new Response("Not found",{status:404,headers:{"X-Robots-Tag":"noindex, nofollow"}});
  }
};