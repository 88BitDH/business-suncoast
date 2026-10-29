// Staged replacement for Cloudflare Worker: suncoast-lead-form.
// DO NOT DEPLOY before the OTP gateway works end-to-end.
// Required encrypted bindings: LEAD_GATEWAY_SECRET, TURNSTILE_SECRET, MAKE_WEBHOOK_URL.
// No secret values or webhook paths belong in source control.
const FORM_URL = "https://business.suncoasttechsupport.net/";
const THANK_YOU_URL = "https://business.suncoasttechsupport.net/thank-you.html";
const FORM_HOSTNAME = "business.suncoasttechsupport.net";
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
  const result = value === null ? fallback : String(value).trim();
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

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
    }
    // The OTP gateway sends this credential server-to-server. The browser never does.
    const supplied = request.headers.get("X-Suncoast-OTP-Gateway-Secret") || "";
    if (!env.LEAD_GATEWAY_SECRET || supplied !== env.LEAD_GATEWAY_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }
    if (!env.TURNSTILE_SECRET || !env.MAKE_WEBHOOK_URL || !validWebhook(env.MAKE_WEBHOOK_URL)) {
      console.error("Business lead Worker configuration missing or invalid");
      return htmlMessage("Service Unavailable", "Please call or text " + PHONE + " for help.", 503);
    }
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > MAX_REQUEST_BYTES) {
      return htmlMessage("Request Too Large", "Please shorten your message and try again.", 413);
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
