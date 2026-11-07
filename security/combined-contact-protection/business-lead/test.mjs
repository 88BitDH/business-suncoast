// Offline regression tests. Requires Node.js 22+. No production network requests.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "./index.js";

const makeEndpoint = "https://hook.us2.make.com/TEST_ONLY_NOT_REAL";
const env = { TURNSTILE_SECRET: "NOT_A_REAL_TURNSTILE_SECRET", MAKE_WEBHOOK_URL: makeEndpoint };
const lead = {
  name: "Test Lead",
  email: "test@example.test",
  phone: "727-555-0100",
  help: "Microsoft 365 support",
  lead_source: "Google Ads",
  page_name: "Business IT Landing Page",
  utm_source: "google",
  utm_campaign: "campaign-1",
  utm_term: "m365",
  utm_medium: "cpc",
  landing_page: "https://business.suncoasttechsupport.net/",
  "cf-turnstile-response": "fresh-single-use-token"
};
function request(fields = {}, opts = {}) {
  const values = { ...lead, ...fields };
  const body = new URLSearchParams(values);
  const headers = {};
  if (opts.contentLength !== undefined) headers["Content-Length"] = String(opts.contentLength);
  if (opts.contentType) headers["Content-Type"] = opts.contentType;
  return new Request("https://suncoast-lead-form.example.test/", { method: "POST", headers, body });
}
async function withFetch(action, opts = {}) {
  const previous = globalThis.fetch;
  const originalLog = console.log, originalError = console.error;
  const calls = [], logs = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/turnstile/v0/siteverify")) {
      if (opts.verifyThrow) throw new Error("simulated siteverify outage");
      return new Response(JSON.stringify({
        success: opts.verified !== false,
        hostname: opts.hostname || "business.suncoasttechsupport.net",
        action: ""
      }), { status: opts.verifyStatus || 200, headers: { "Content-Type": "application/json" } });
    }
    if (String(url) === makeEndpoint) {
      if (opts.makeThrow) throw new Error("simulated webhook failure");
      return new Response("mock accepted", { status: opts.makeStatus || 200 });
    }
    throw new Error("Unexpected outgoing network call");
  };
  console.log = (...items) => { logs.push(items.join(" ")); };
  console.error = (...items) => { logs.push(items.join(" ")); };
  try { await action({ calls, logs }); }
  finally { globalThis.fetch = previous; console.log = originalLog; console.error = originalError; }
}

test("native business form forwards EXACT eleven Make keys and redirects", async () => {
  await withFetch(async ({calls, logs}) => {
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), "https://business.suncoasttechsupport.net/thank-you.html");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].init.body.get("secret"), env.TURNSTILE_SECRET);
    assert.equal(calls[0].init.body.get("response"), lead["cf-turnstile-response"]);
    const payload = JSON.parse(calls[1].init.body);
    assert.deepEqual(Object.keys(payload), [
      "name","email","phone","help","source","page_name",
      "utm_source","utm_campaign","utm_term","utm_medium","landing_page"
    ]);
    assert.equal(payload.source, lead.lead_source);
    assert.equal(payload.utm_campaign, lead.utm_campaign);
    assert.equal(payload.email, lead.email);
    assert.ok(logs.every(x => !x.includes(lead.email) && !x.includes(lead.phone)));
  });
});
test("minimal FTC/WISP form works without help, phone or UTM fields", async () => {
  await withFetch(async ({calls}) => {
    const response = await worker.fetch(request({
      name:"FTC Prospect", email:"wisp@example.test",
      phone:"", help:"", lead_source:"Website", page_name:"FTC Safeguards Support",
      utm_source:"", utm_campaign:"", utm_term:"", utm_medium:"", landing_page:""
    }),env);
    assert.equal(response.status,302);
    const data = JSON.parse(calls[1].init.body);
    assert.equal(data.help,"");
    assert.equal(data.phone,"");
    assert.equal(data.page_name,"FTC Safeguards Support");
  });
});
test("customer website review retains review message and its source", async () => {
  await withFetch(async ({calls}) => {
    const rating = "Customer website review (5/5 stars). Permission to contact about website publication: No.\n\nPrompt assistance";
    const response = await worker.fetch(request({
      name:"Reviewer", email:"reviewer@example.test", phone:"",
      help:rating, lead_source:"Customer Website Feedback", page_name:"Website Customer Review"
    }),env);
    assert.equal(response.status,302);
    const payload = JSON.parse(calls[1].init.body);
    assert.equal(payload.help,rating);
    assert.equal(payload.source,"Customer Website Feedback");
  });
});
test("POST from a normal form does not require the proposed OTP gateway", async () => {
  await withFetch(async ({calls}) => {
    assert.equal((await worker.fetch(request(),env)).status,302);
    assert.equal(calls.length,2);
  });
});
test("missing and malformed email, name, and CAPTCHA are rejected without outbound calls", async () => {
  await withFetch(async ({calls}) => {
    for (const fields of [
      {name:""}, {email:"bad@"}, {"cf-turnstile-response":""},
      {"cf-turnstile-response":"x".repeat(2049)}
    ]) assert.equal((await worker.fetch(request(fields),env)).status,400);
    assert.equal(calls.length,0);
  });
});
test("failed, expired or replayed Turnstile verification is rejected", async () => {
  await withFetch(async ({calls}) => {
    assert.equal((await worker.fetch(request(),env)).status,403);
    assert.equal(calls.length,1);
  },{verified:false});
});
test("wrong Turnstile hostname is rejected, Make is never called", async () => {
  await withFetch(async ({calls}) => {
    assert.equal((await worker.fetch(request(),env)).status,403);
    assert.equal(calls.length,1);
  },{hostname:"residential.example.test"});
});
test("Siteverify outage fails closed", async () => {
  await withFetch(async ({calls}) => {
    assert.equal((await worker.fetch(request(),env)).status,503);
    assert.equal(calls.length,1);
  },{verifyThrow:true});
});
test("non-200 Siteverify response fails closed", async () => {
  await withFetch(async ({calls}) => {
    assert.equal((await worker.fetch(request(),env)).status,503);
    assert.equal(calls.length,1);
  },{verifyStatus:503});
});
test("Make webhook outage does not issue a success redirect", async () => {
  await withFetch(async ({calls}) => {
    assert.equal((await worker.fetch(request(),env)).status,500);
    assert.equal(calls.length,2);
  },{makeStatus:503});
});
test("Make network exception does not claim success", async () => {
  await withFetch(async ({calls}) => {
    assert.equal((await worker.fetch(request(),env)).status,500);
    assert.equal(calls.length,2);
  },{makeThrow:true});
});
test("missing encrypted secret bindings fail closed", async () => {
  await withFetch(async ({calls}) => {
    assert.equal((await worker.fetch(request(),{...env, TURNSTILE_SECRET:""})).status,503);
    assert.equal((await worker.fetch(request(),{...env, MAKE_WEBHOOK_URL:""})).status,503);
    assert.equal(calls.length,0);
  });
});
test("webhook must use approved Make HTTPS hostname", async () => {
  await withFetch(async ({calls}) => {
    assert.equal((await worker.fetch(request(),{...env, MAKE_WEBHOOK_URL:"http://hook.us2.make.com/x"})).status,503);
    assert.equal((await worker.fetch(request(),{...env, MAKE_WEBHOOK_URL:"https://bad.test/" })).status,503);
    assert.equal(calls.length,0);
  });
});
test("browser form content-type is required", async () => {
  await withFetch(async ({calls}) => {
    assert.equal((await worker.fetch(request({}, {contentType:"application/json"}),env)).status,415);
    assert.equal(calls.length,0);
  });
});
test("declared over-limit or invalid content length rejected", async () => {
  await withFetch(async ({calls}) => {
    assert.equal((await worker.fetch(request({}, {contentLength:16001}),env)).status,413);
    assert.equal((await worker.fetch(request({}, {contentLength:-1}),env)).status,413);
    assert.equal(calls.length,0);
  });
});
test("actual streamed oversized body rejected even without content-length", async () => {
  await withFetch(async ({calls}) => {
    const tooLong = request({help:"x".repeat(16500)});
    assert.equal((await worker.fetch(tooLong,env)).status,413);
    assert.equal(calls.length,0);
  });
});
test("multipart FormData submissions are compatible", async () => {
  await withFetch(async ({calls}) => {
    const form=new FormData();
    for(const [k,v] of Object.entries(lead))form.append(k,v);
    const req=new Request("https://suncoast-lead-form.example.test/",{method:"POST",body:form});
    assert.equal((await worker.fetch(req,env)).status,302);
    assert.equal(calls.length,2);
  });
});
test("unsupported uploaded File value rejected", async () => {
  await withFetch(async ({calls}) => {
    const form=new FormData();for(const [k,v] of Object.entries(lead)) form.append(k,v);
    form.set("name",new Blob(["bad"]), "bad.txt");
    const req=new Request("https://suncoast-lead-form.example.test/",{method:"POST",body:form});
    assert.equal((await worker.fetch(req,env)).status,400);
    assert.equal(calls.length,0);
  });
});
test("GET method refused with HTTP 405", async () => {
  const r=await worker.fetch(new Request("https://suncoast-lead-form.example.test/"),env);
  assert.equal(r.status,405);
  assert.equal(r.headers.get("Allow"),"POST");
});
test("static source has no embedded production secrets, webhook, or OTP gate",()=>{
  const src=readFileSync(new URL("./index.js",import.meta.url),"utf8");
  assert.doesNotMatch(src,/https:\/\/hook\.[a-z0-9-]+\.make\.com\//i);
  assert.doesNotMatch(src,/LEAD_GATEWAY_SECRET|X-Suncoast-OTP-Gateway-Secret/);
  assert.match(src,/env\.TURNSTILE_SECRET/);
  assert.match(src,/env\.MAKE_WEBHOOK_URL/);
});
