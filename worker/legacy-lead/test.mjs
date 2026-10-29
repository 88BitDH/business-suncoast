// Node.js 22+ test suite: node --test worker/legacy-lead/test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";

const secret = "g".repeat(64);
const makeEndpoint = "https://hook.us2.make.com/REDACTED_TEST_WEBHOOK";
const env = {
  LEAD_GATEWAY_SECRET: secret,
  TURNSTILE_SECRET: "rotated_secret_placeholder",
  MAKE_WEBHOOK_URL: makeEndpoint
};
const data = {
  name: "Business Lead",
  email: "prospect@example.com",
  phone: "727-555-0100",
  help: "Microsoft 365 migration",
  lead_source: "Google Ads",
  page_name: "Business IT Landing Page",
  utm_source: "google",
  utm_campaign: "new-leads",
  utm_term: "IT support",
  utm_medium: "cpc",
  landing_page: "https://business.suncoasttechsupport.net/",
  "cf-turnstile-response": "separate-fresh-token"
};
function post(overrides = {}, gatewaySecret = secret) {
  return new Request("https://legacy-worker.example/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Suncoast-OTP-Gateway-Secret": gatewaySecret
    },
    body: new URLSearchParams({ ...data, ...overrides })
  });
}
async function withMockedFetch(action, { verified = true, hostname = "business.suncoasttechsupport.net", makeStatus = 200 } = {}) {
  const saved = globalThis.fetch;
  const events = [];
  globalThis.fetch = async (url, init) => {
    events.push({ url: String(url), init });
    if (String(url).includes("turnstile/v0/siteverify")) {
      return Response.json({ success: verified, hostname });
    }
    if (String(url) === makeEndpoint) {
      return new Response("accepted", { status: makeStatus });
    }
    throw Error("Unexpected fetch URL");
  };
  try { await action(events); } finally { globalThis.fetch = saved; }
}

test("rejects direct submissions before Turnstile and Make", async () => {
  await withMockedFetch(async events => {
    const result = await worker.fetch(post({}, "incorrect"), env);
    assert.equal(result.status, 403);
    assert.equal(events.length, 0);
  });
});

test("forwards verified lead with Make.com payload contract and redirects", async () => {
  await withMockedFetch(async events => {
    const result = await worker.fetch(post(), env);
    assert.equal(result.status, 302);
    assert.equal(result.headers.get("Location"),
      "https://business.suncoasttechsupport.net/thank-you.html");
    assert.equal(events.length, 2);
    assert.equal(events[0].url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(events[0].init.body.get("response"), "separate-fresh-token");
    assert.equal(events[1].url, makeEndpoint);
    const payload = JSON.parse(events[1].init.body);
    assert.deepEqual(Object.keys(payload), [
      "name","email","phone","help","source","page_name",
      "utm_source","utm_campaign","utm_term","utm_medium","landing_page"
    ]);
    assert.equal(payload.source, "Google Ads");
    assert.equal(payload.utm_campaign, "new-leads");
    assert.equal(payload.email, "prospect@example.com");
    assert.equal(payload.help, "Microsoft 365 migration");
  });
});

test("rejects a failed challenge and mismatched hostname", async () => {
  for (const options of [
    { verified: false },
    { hostname: "evil.example" }
  ]) {
    await withMockedFetch(async events => {
      const result = await worker.fetch(post(), env);
      assert.equal(result.status, 403);
      assert.equal(events.length, 1);
    }, options);
  }
});

test("does not redirect when Make.com rejects delivery", async () => {
  await withMockedFetch(async events => {
    const result = await worker.fetch(post(), env);
    assert.equal(result.status, 500);
    assert.equal(events.length, 2);
  }, { makeStatus: 503 });
});

test("requires a meaningful name, valid email, and fresh Turnstile token", async () => {
  await withMockedFetch(async events => {
    assert.equal((await worker.fetch(post({ name: "" }), env)).status, 400);
    assert.equal((await worker.fetch(post({ email: "broken@" }), env)).status, 400);
    assert.equal((await worker.fetch(post({ "cf-turnstile-response": "" }), env)).status, 400);
    assert.equal(events.length, 0);
  });
});

test("fails closed if required secret configuration is absent", async () => {
  await withMockedFetch(async events => {
    const response = await worker.fetch(post(), { ...env, LEAD_GATEWAY_SECRET: "" });
    assert.equal(response.status, 403);
    assert.equal(events.length, 0);
  });
});
