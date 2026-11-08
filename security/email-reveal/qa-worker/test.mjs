import test from "node:test";
import assert from "node:assert/strict";
import qa from "./index.js";

const host = "suncoast-email-reveal-qa-20261108.iammoeskicova0808.workers.dev";
const base = "https://" + host;
const env = {
  TURNSTILE_SECRET: "SYNTHETIC_SECRET",
  SALES_EMAIL: "sales@example.test",
  PARTNERS_EMAIL: "partners@example.test",
  EMAIL_REVEAL_LIMITER: { limit: async () => ({ success: true }) },
};
function request(url,opts={}) {
  return new Request(url,{method:"POST",headers:{
    Origin:opts.origin||base,"Content-Type":"application/json"
  },body:JSON.stringify({mailbox:opts.mailbox||"sales",token:opts.token??"synthetic-token"})});
}
async function mockSiteverify(fn,{success=true,hostname=host,action="email_reveal"}={}) {
  const saved=globalThis.fetch;
  let count=0;
  globalThis.fetch=async (url)=>{count++;
    assert.equal(String(url),"https://challenges.cloudflare.com/turnstile/v0/siteverify");
    return Response.json({success,hostname,action});
  };
  try {await fn(()=>count);} finally {globalThis.fetch=saved;}
}
test("QA page has synthetic-only protected buttons and contact fallback",async()=>{
  const response=await qa.fetch(new Request(base+"/qa"),env);
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/data-email-reveal="sales"/);
  assert.match(html,/data-email-reveal="partners"/);
  assert.match(html,/example\.test/);
  assert.match(html,/business\.suncoasttechsupport\.net\/#contact/);
  assert.doesNotMatch(html,/(?:sales|partners)@suncoasttechsupport\.(com|net)/i);
  assert.match(response.headers.get("X-Robots-Tag"),/noindex/);
});
test("QA client loads with QA-only sitekey, same production modal functionality",async()=>{
  const response=await qa.fetch(new Request(base+"/assets/email-reveal.js"),env);
  assert.equal(response.status,200);
  const body=await response.text();
  assert.match(body,/0x4AAAAAAF4ubrYcqJYpCexy/);
  assert.doesNotMatch(body,/0x4AAAAAAF4tQwhQiUBOGQe0/);
  assert.match(body,/email_reveal/);
  assert.match(body,/data-email-reveal/);
});
test("QA modal CSS serves without endpoint or email references",async()=>{
  const response=await qa.fetch(new Request(base+"/assets/email-reveal.css"),env);
  assert.equal(response.status,200);
  assert.match(await response.text(),/sc-email-panel/);
});
test("QA Worker only answers its own exact staging hostname",async()=>{
  const response=await qa.fetch(new Request("https://business.suncoasttechsupport.net/qa"),env);
  assert.equal(response.status,404);
});
test("QA Worker never offers the real business-host API path",async()=>{
  const response=await qa.fetch(new Request(base+"/other"),env);
  assert.equal(response.status,404);
});
test("QA synthetic verified Sales alias succeeds after runtime-like Siteverify",async()=>{
  await mockSiteverify(async count=>{
    const response=await qa.fetch(request(base+"/api/email-reveal"),env);
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{email:"sales@example.test"});
    assert.equal(count(),1);
  });
});
test("QA synthetic verified Partners alias succeeds",async()=>{
  await mockSiteverify(async()=>{
    const response=await qa.fetch(request(base+"/api/email-reveal",{mailbox:"partners"}),env);
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{email:"partners@example.test"});
  });
});
test("wrong action rejects the token without exposing aliases",async()=>{
  await mockSiteverify(async()=>{
    const response=await qa.fetch(request(base+"/api/email-reveal"),env);
    assert.equal(response.status,403);
    assert.doesNotMatch(await response.text(),/example\.test/);
  },{action:"lead_contact"});
});
test("unverified Siteverify token rejects before alias reveal",async()=>{
  await mockSiteverify(async()=>{
    assert.equal((await qa.fetch(request(base+"/api/email-reveal"),env)).status,403);
  },{success:false});
});
test("rate limit blocks before making Siteverify call",async()=>{
  await mockSiteverify(async count=>{
    const limited={...env,EMAIL_REVEAL_LIMITER:{limit:async()=>({success:false})}};
    const response=await qa.fetch(request(base+"/api/email-reveal"),limited);
    assert.equal(response.status,429);
    assert.equal(count(),0);
  });
});
test("QA requests with missing binding fail closed",async()=>{
  const response=await qa.fetch(request(base+"/api/email-reveal"),{...env,TURNSTILE_SECRET:""});
  assert.equal(response.status,503);
});

test("QA page exercises the real modal entrypoints, header icon, and preloaded Turnstile branch", async()=>{
 const response=await qa.fetch(new Request(base+"/qa"),env);
 assert.equal(response.status,200);
 const html=await response.text();
 assert.match(html,/class="sc-header"/);
 assert.match(html,/class="sc-email-trigger" data-email-reveal="sales"/);
 assert.match(html,/class="sc-email-inline" data-email-reveal="sales"/);
 assert.match(html,/class="sc-email-inline" data-email-reveal="partners"/);
 assert.match(html,/name="viewport"/);
 assert.match(html,/turnstile\/v0\/api\.js/);
 assert.match(html,/assets\/email-reveal\.js/);
 assert.match(html,/business\.suncoasttechsupport\.net\/#contact/);
 assert.doesNotMatch(html,/(?:sales|partners|support)@suncoasttechsupport\.(com|net)/i);
});
