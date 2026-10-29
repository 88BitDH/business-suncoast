// Suncoast contact OTP gateway. Requires D1, Turnstile, Resend and existing lead handler.
// Do not deploy over the current lead handler. See README.md for rollout requirements.
const OTP_TTL_SECONDS = 10 * 60;
const PROOF_TTL_SECONDS = 20 * 60;
const MAX_OTP_ATTEMPTS = 5;
const MAX_BODY_BYTES = 16000;
const LEAD_FIELDS = [
  "name", "email", "phone", "help", "lead_source", "page_name",
  "utm_source", "utm_campaign", "utm_term", "utm_medium", "landing_page",
  "cf-turnstile-response"
];

function respond(data, status, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin"
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function cleanEmail(input) {
  const value = String(input || "").trim().toLowerCase();
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
}

function validCode(value) {
  return /^[0-9]{6}$/.test(String(value || ""));
}

function newCode() {
  // Rejection sampling avoids modulo bias.
  const max = 4294000000;
  const values = new Uint32Array(1);
  do { crypto.getRandomValues(values); } while (values[0] >= max);
  return String(values[0] % 1000000).padStart(6, "0");
}

function newProof() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key, data) {
  const secret = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const value = await crypto.subtle.sign("HMAC", secret, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(value), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function withinLimit(env, name, identity, max, windowSeconds, now) {
  const bucket = Math.floor(now / windowSeconds);
  const digest = await hmac(env.OTP_SECRET, name + ":" + identity + ":" + bucket);
  const result = await env.DB.prepare(
    "INSERT INTO otp_limits (id, hits, expires_at) VALUES (?, 1, ?) " +
    "ON CONFLICT(id) DO UPDATE SET hits = hits + 1 WHERE hits < ? RETURNING hits"
  ).bind(digest, (bucket + 1) * windowSeconds, max).first();
  return Boolean(result);
}

async function validateTurnstile(env, token, request) {
  if (!token || String(token).length > 2048) return false;
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET,
    response: String(token),
    remoteip: request.headers.get("CF-Connecting-IP") || ""
  });
  const validation = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", body, signal: AbortSignal.timeout(8000)
  });
  if (!validation.ok) return false;
  const result = await validation.json();
  // Require a token issued for the production site, not just any valid Turnstile token.
  const hostname = new URL(env.SITE_ORIGIN).hostname;
  return result.success === true && result.hostname === hostname;
}

async function sendCodeEmail(env, email, code) {
  const payload = {
    from: env.OTP_FROM,
    to: [email],
    subject: "Your Suncoast Tech Support verification code",
    text: "Your Suncoast Tech Support contact-form code is " + code +
      ". It expires in 10 minutes. If you did not request this, ignore this email."
  };
  const reply = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000)
  });
  return reply.ok;
}

function validConfiguration(env) {
  return Boolean(env.DB && env.OTP_SECRET && env.OTP_SECRET.length >= 32 &&
    env.RESEND_API_KEY && env.TURNSTILE_SECRET && env.OTP_FROM &&
    env.SITE_ORIGIN && env.LEAD_UPSTREAM_URL && env.LEAD_GATEWAY_SECRET && env.LEAD_GATEWAY_SECRET.length >= 32);
}

function trustedUpstream(env) {
  const url = new URL(env.LEAD_UPSTREAM_URL);
  return url.protocol === "https:" && url.hostname.endsWith(".workers.dev");
}

async function readJson(request) {
  const size = Number(request.headers.get("content-length") || 0);
  if (size > MAX_BODY_BYTES) throw new Error("too-large");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("too-large");
  return JSON.parse(text);
}

async function start(request, env, origin) {
  const data = await readJson(request);
  const email = cleanEmail(data.email);
  if (!email) return respond({ error: "Enter a valid email address." }, 400, origin);
  const now = Math.floor(Date.now() / 1000);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipHash = await hmac(env.OTP_SECRET, "ip:" + ip);
  const emailHash = await hmac(env.OTP_SECRET, "email:" + email);

  // Check limits before spending resources on Turnstile / sending email.
  if (!await withinLimit(env, "ip-1m", ipHash, 4, 60, now) ||
      !await withinLimit(env, "ip-1h", ipHash, 20, 3600, now) ||
      !await withinLimit(env, "email-1h", emailHash, 3, 3600, now) ||
      !await withinLimit(env, "email-1m", emailHash, 2, 60, now)) {
    return respond({ error: "Too many requests. Please try again later." }, 429, origin);
  }
  if (!await validateTurnstile(env, data.turnstileToken, request)) {
    return respond({ error: "Please complete the security check and try again." }, 400, origin);
  }

  const id = crypto.randomUUID();
  const code = newCode();
  const codeHash = await hmac(env.OTP_SECRET, "code:" + id + ":" + email + ":" + code);
  await env.DB.prepare(
    "UPDATE otp_challenges SET expires_at = ? WHERE email_hash = ? AND verified_at IS NULL"
  ).bind(now, emailHash).run();
  await env.DB.prepare(
    "INSERT INTO otp_challenges (id, email_hash, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, emailHash, codeHash, now, now + OTP_TTL_SECONDS).run();

  let sent = false;
  try { sent = await sendCodeEmail(env, email, code); } catch (_) { /* transient delivery issue */ }
  if (!sent) {
    await env.DB.prepare("DELETE FROM otp_challenges WHERE id = ?").bind(id).run();
    return respond({ error: "Unable to send a verification code. Please try again later." }, 503, origin);
  }
  return respond({ ok: true, challengeId: id, expiresIn: OTP_TTL_SECONDS }, 200, origin);
}

async function verify(request, env, origin) {
  const data = await readJson(request);
  const email = cleanEmail(data.email);
  const id = String(data.challengeId || "");
  if (!email || !validCode(data.code) || !/^[a-f0-9-]{36}$/i.test(id)) {
    return respond({ error: "Enter the six-digit code sent to your email." }, 400, origin);
  }
  const now = Math.floor(Date.now() / 1000);
  const emailHash = await hmac(env.OTP_SECRET, "email:" + email);
  const codeHash = await hmac(env.OTP_SECRET, "code:" + id + ":" + email + ":" + data.code);
  const proof = newProof();
  const proofHash = await hmac(env.OTP_SECRET, "proof:" + proof);

  // A single atomic update counts failed attempts and issues proof only for a correct code.
  const result = await env.DB.prepare(
    "UPDATE otp_challenges SET " +
    "attempts = attempts + 1, " +
    "verified_at = CASE WHEN code_hash = ? THEN ? ELSE NULL END, " +
    "proof_hash = CASE WHEN code_hash = ? THEN ? ELSE NULL END, " +
    "proof_expires_at = CASE WHEN code_hash = ? THEN ? ELSE NULL END " +
    "WHERE id = ? AND email_hash = ? AND attempts < ? AND expires_at > ? " +
    "AND verified_at IS NULL RETURNING verified_at, attempts"
  ).bind(codeHash, now, codeHash, proofHash, codeHash, now + PROOF_TTL_SECONDS,
    id, emailHash, MAX_OTP_ATTEMPTS, now).first();

  if (!result || result.verified_at !== now) {
    return respond({ error: "Invalid or expired code. Check the code or request another." }, 400, origin);
  }
  return respond({ ok: true, proofToken: proof, expiresIn: PROOF_TTL_SECONDS }, 200, origin);
}

async function submit(request, env, origin) {
  const size = Number(request.headers.get("content-length") || 0);
  if (size > MAX_BODY_BYTES) return respond({ error: "Message is too long." }, 413, origin);
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return respond({ error: "Message is too long." }, 413, origin);
  const data = new URLSearchParams(raw);
  const email = cleanEmail(data.get("email"));
  const name = String(data.get("name") || "").trim();
  const proof = String(data.get("otp_token") || "");
  if (!email || !name || name.length > 160 ||
      !/^[a-f0-9]{64}$/.test(proof) || !data.get("cf-turnstile-response")) {
    return respond({ error: "Please verify your email and complete the security check." }, 400, origin);
  }
  if (String(data.get("help") || "").length > 5000 ||
      String(data.get("phone") || "").length > 100) {
    return respond({ error: "Please shorten your message." }, 400, origin);
  }
  const now = Math.floor(Date.now() / 1000);
  const proofHash = await hmac(env.OTP_SECRET, "proof:" + proof);
  const emailHash = await hmac(env.OTP_SECRET, "email:" + email);

  // Consuming proof atomically prevents multiple submissions with a single OTP.
  const claim = await env.DB.prepare(
    "UPDATE otp_challenges SET consumed_at = ? " +
    "WHERE email_hash = ? AND proof_hash = ? AND verified_at IS NOT NULL " +
    "AND proof_expires_at > ? AND consumed_at IS NULL RETURNING id"
  ).bind(now, emailHash, proofHash, now).first();
  if (!claim) return respond({ error: "Email verification expired or was already used. Request a new code." }, 403, origin);

  const upstreamData = new URLSearchParams();
  for (const key of LEAD_FIELDS) {
    if (data.has(key)) upstreamData.append(key, String(data.get(key)));
  }
  let upstream;
  try {
    upstream = await fetch(env.LEAD_UPSTREAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": env.SITE_ORIGIN,
        "X-Suncoast-OTP-Gateway-Secret": env.LEAD_GATEWAY_SECRET
      },
      body: upstreamData.toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(15000)
    });
  } catch (_) {
    // Delivery state is uncertain after a transport failure. Do not reuse proof,
    // to avoid sending duplicate leads.
    return respond({ error: "Delivery could not be confirmed. Please call or text (727) 647-9000." }, 502, origin);
  }
  if (upstream.status < 200 || upstream.status >= 400) {
    // A definite upstream rejection permits a retry, using a fresh Turnstile token.
    await env.DB.prepare("UPDATE otp_challenges SET consumed_at = NULL WHERE id = ? AND consumed_at = ?")
      .bind(claim.id, now).run();
    return respond({ error: "Request was not accepted. Refresh the security check and try again." }, 502, origin);
  }
  return respond({ ok: true }, 200, origin);
}

export default {
  async fetch(request, env) {
    let origin;
    try {
      if (!validConfiguration(env) || !trustedUpstream(env)) {
        return respond({ error: "OTP service not configured." }, 503, null);
      }
      origin = env.SITE_ORIGIN.replace(/\/$/, "");
      if (request.headers.get("Origin") !== origin) {
        return respond({ error: "Origin not allowed." }, 403, null);
      }
      const path = new URL(request.url).pathname;
      if (request.method === "OPTIONS") return new Response(null, {
        status: 204, headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600",
          "Vary": "Origin"
        }
      });
      if (request.method !== "POST") return respond({ error: "Method not allowed." }, 405, origin);
      if (path === "/start" || path === "/verify") {
        if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
          return respond({ error: "Expected JSON." }, 415, origin);
        }
        return path === "/start" ? await start(request, env, origin) : await verify(request, env, origin);
      }
      if (path === "/submit") {
        if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
          return respond({ error: "Expected form submission." }, 415, origin);
        }
        return await submit(request, env, origin);
      }
      return respond({ error: "Not found." }, 404, origin);
    } catch (error) {
      if (error instanceof SyntaxError) return respond({ error: "Invalid request." }, 400, origin);
      if (error.message === "too-large") return respond({ error: "Request too large." }, 413, origin);
      console.error("Suncoast OTP request failed:", error.name);
      return respond({ error: "Service temporarily unavailable." }, 503, origin);
    }
  },
  async scheduled(_event, env) {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("DELETE FROM otp_challenges WHERE expires_at < ? AND (proof_expires_at IS NULL OR proof_expires_at < ?)")
      .bind(now - 86400, now - 86400).run();
    await env.DB.prepare("DELETE FROM otp_limits WHERE expires_at < ?").bind(now - 86400).run();
  }
};
