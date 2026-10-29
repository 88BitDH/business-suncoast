// Run with Node.js 22+: node --test test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import gateway from "./index.js";

const site = "https://business.suncoasttechsupport.net";
const upstream = "https://suncoast-lead-form.iammoeskicova0808.workers.dev/";
let sentCode;
let forwarded;
let upstreamCalls;

function setup() {
  const database = new DatabaseSync(":memory:");
  database.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  const DB = {
    prepare(sql) {
      const stmt = database.prepare(sql);
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() { return stmt.get(...params) || null; },
        async run() { return stmt.run(...params); }
      };
    }
  };
  sentCode = "";
  forwarded = "";
  upstreamCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const dest = String(url);
    if (dest.includes("siteverify")) {
      return Response.json({ success: true, hostname: "business.suncoasttechsupport.net" });
    }
    if (dest === "https://api.resend.com/emails") {
      sentCode = JSON.parse(opts.body).text.match(/code is ([0-9]{6})/)[1];
      return Response.json({ id: "test-mail-id" });
    }
    if (dest === upstream) {
      upstreamCalls++;
      assert.equal(opts.headers["X-Suncoast-OTP-Gateway-Secret"], "g".repeat(64));
      forwarded = opts.body;
      return new Response(null, { status: 302, headers: { Location: site + "/thank-you.html" } });
    }
    throw Error("Unexpected outbound fetch: " + dest);
  };
  const env = {
    DB, SITE_ORIGIN: site, LEAD_UPSTREAM_URL: upstream,
    TURNSTILE_SECRET: "t".repeat(64), OTP_SECRET: "s".repeat(64),
    LEAD_GATEWAY_SECRET: "g".repeat(64),
    RESEND_API_KEY: "re_test", OTP_FROM: "Suncoast Tech Support <verify@notify.suncoasttechsupport.com>"
  };
  return { env, close() { database.close(); globalThis.fetch = originalFetch; } };
}
function post(path, data, { origin = site, ip = "192.0.2.5", form = false } = {}) {
  return new Request("https://otp.test" + path, {
    method: "POST",
    headers: {
      Origin: origin,
      "CF-Connecting-IP": ip,
      "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json"
    },
    body: form ? new URLSearchParams(data).toString() : JSON.stringify(data)
  });
}
async function json(reply) { return { status: reply.status, body: await reply.json() }; }

test("valid email code, once-only submission, and gateway auth header", async () => {
  const fixture = setup();
  try {
    const { env } = fixture;
    const start = await json(await gateway.fetch(post("/start", {
      email: "customer@example.com", turnstileToken: "valid"
    }), env));
    assert.equal(start.status, 200);
    assert.match(sentCode, /^[0-9]{6}$/);
    const invalid = await json(await gateway.fetch(post("/verify", {
      email: "customer@example.com", challengeId: start.body.challengeId, code: "999999" === sentCode ? "111111" : "999999"
    }), env));
    assert.equal(invalid.status, 400);
    const verified = await json(await gateway.fetch(post("/verify", {
      email: "customer@example.com", challengeId: start.body.challengeId, code: sentCode
    }), env));
    assert.equal(verified.status, 200);
    assert.equal(verified.body.proofToken.length, 64);
    const form = {
      name: "Sample Lead", email: "customer@example.com", help: "Need a Wi-Fi repair",
      utm_source: "google", "cf-turnstile-response": "new-unused-token",
      otp_token: verified.body.proofToken
    };
    const submitted = await json(await gateway.fetch(post("/submit", form, { form: true }), env));
    assert.equal(submitted.status, 200);
    assert.equal(upstreamCalls, 1);
    assert.match(forwarded, /utm_source=google/);
    assert.ok(!forwarded.includes("otp_token"));
    const replay = await json(await gateway.fetch(post("/submit", form, { form: true }), env));
    assert.equal(replay.status, 403);
    assert.equal(upstreamCalls, 1);
  } finally { fixture.close(); }
});

test("wrong email and up to five unsuccessful attempts cannot pass verification", async () => {
  const fixture = setup();
  try {
    const { env } = fixture;
    const sent = await json(await gateway.fetch(post("/start", {
      email: "a@example.net", turnstileToken: "token"
    }), env));
    const id = sent.body.challengeId;
    const wrongCode = sentCode === "555555" ? "444444" : "555555";
    const mismatch = await json(await gateway.fetch(post("/verify", {
      email: "other@example.net", challengeId: id, code: sentCode
    }), env));
    assert.equal(mismatch.status, 400);
    for (let i = 0; i < 5; i++) {
      const reply = await json(await gateway.fetch(post("/verify", {
        email: "a@example.net", challengeId: id, code: wrongCode
      }), env));
      assert.equal(reply.status, 400);
    }
    const locked = await json(await gateway.fetch(post("/verify", {
      email: "a@example.net", challengeId: id, code: sentCode
    }), env));
    assert.equal(locked.status, 400);
  } finally { fixture.close(); }
});

test("reject cross-origin use, unverified direct submissions, and IP rate-limit abuse", async () => {
  const fixture = setup();
  try {
    const { env } = fixture;
    const badOrigin = await json(await gateway.fetch(post("/start", {
      email: "a@example.net", turnstileToken: "valid"
    }, { origin: "https://evil.example" }), env));
    assert.equal(badOrigin.status, 403);
    const forged = await json(await gateway.fetch(post("/submit", {
      name: "Anonymous", email: "a@example.net", otp_token: "a".repeat(64),
      "cf-turnstile-response": "valid"
    }, { form: true }), env));
    assert.equal(forged.status, 403);
    for (let n = 0; n < 4; n++) {
      const sent = await json(await gateway.fetch(post("/start", {
        email: "user" + n + "@example.net", turnstileToken: "valid"
      }), env));
      assert.equal(sent.status, 200);
    }
    const blocked = await json(await gateway.fetch(post("/start", {
      email: "fifth@example.net", turnstileToken: "valid"
    }), env));
    assert.equal(blocked.status, 429);
  } finally { fixture.close(); }
});
