import test from "node:test";
import assert from "node:assert/strict";
import qa from "./runtime.js";

const host="suncoast-email-reveal-qa-20261108.iammoeskicova0808.workers.dev";
const base="https://"+host;
const env={
  TURNSTILE_SECRET:"SYNTHETIC_QA_SECRET",
  SALES_EMAIL:"sales@example.test",
  PARTNERS_EMAIL:"partners@example.test",
  EMAIL_REVEAL_LIMITER:{limit:async()=>({success:true})}
};
const req=(payload={mailbox:"sales",token:"example-token"},opts={})=>
  new Request(opts.url||base+"/api/email-reveal",{
    method:"POST",headers:{
      Origin:opts.origin||base,
      "Content-Type":"application/json"
    },body:JSON.stringify(payload)
  });
async function withVerify(f,{success=true,hostname=host,action="email_reveal"}={}){
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async (url, init)=>{
    calls++;
    assert.equal(String(url),"https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(init.body.get("secret"),env.TURNSTILE_SECRET);
    return Response.json({success,hostname,action});
  };
  try {await f(()=>calls);} finally {globalThis.fetch=original;}
}
test("deployed runtime QA form uses correct real-widget sitekey and action",async()=>{
  const r=await qa.fetch(new Request(base+"/qa"),env);
  assert.equal(r.status,200);
  const body=await r.text();
  assert.match(body,/0x4AAAAAAF4ubrYcqJYpCexy/);
  assert.match(body,/data-action="email_reveal"/);
  assert.match(body,/example\.test/);
  assert.match(body,/Suncoast email reveal — QA/);
  assert.doesNotMatch(body,/(?:sales|partners|support)@suncoasttechsupport\.(com|net)/i);
  assert.match(r.headers.get("X-Robots-Tag"),/noindex/);
});
test("QA home page shows same test form",async()=>{
  const r=await qa.fetch(new Request(base+"/"),env);
  assert.equal(r.status,200);
});
test("synthetic Sales alias returned only after verified action and host",async()=>{
  await withVerify(async calls=>{
    const r=await qa.fetch(req(),env);
    assert.equal(r.status,200);
    assert.deepEqual(await r.json(),{email:env.SALES_EMAIL});
    assert.equal(calls(),1);
  });
});
test("synthetic Partners alias works",async()=>{
  await withVerify(async()=>{
    const r=await qa.fetch(req({mailbox:"partners",token:"other-token"}),env);
    assert.equal(r.status,200);
    assert.deepEqual(await r.json(),{email:env.PARTNERS_EMAIL});
  });
});
test("missing token fails without external request",async()=>{
  await withVerify(async calls=>{
    const r=await qa.fetch(req({mailbox:"sales",token:""}),env);
    assert.equal(r.status,400);
    assert.equal(calls(),0);
  });
});
test("failed Siteverify response does not reveal email",async()=>{
  await withVerify(async()=>{
    assert.equal((await qa.fetch(req(),env)).status,403);
  },{success:false});
});
test("token for contact form action rejected",async()=>{
  await withVerify(async()=>{
    assert.equal((await qa.fetch(req(),env)).status,403);
  },{action:"contact_form"});
});
test("token for production hostname rejected",async()=>{
  await withVerify(async()=>{
    assert.equal((await qa.fetch(req(),env)).status,403);
  },{hostname:"business.suncoasttechsupport.net"});
});
test("rate limiter rejects before Siteverify",async()=>{
  await withVerify(async calls=>{
    const limited={...env,EMAIL_REVEAL_LIMITER:{limit:async()=>({success:false})}};
    assert.equal((await qa.fetch(req(),limited)).status,429);
    assert.equal(calls(),0);
  });
});
test("no rate-limit binding fails closed",async()=>{
  assert.equal((await qa.fetch(req(),{...env,EMAIL_REVEAL_LIMITER:undefined})).status,503);
});
test("non-POST request is not an email API",async()=>{
  assert.equal((await qa.fetch(new Request(base+"/api/email-reveal"),env)).status,404);
});
test("production hostname is never served by staging worker",async()=>{
  assert.equal((await qa.fetch(new Request("https://business.suncoasttechsupport.net/qa"),env)).status,404);
});
test("unexpected request path fails closed",async()=>{
  assert.equal((await qa.fetch(new Request(base+"/private"),env)).status,404);
});
test("bogus Origin rejected prior to Siteverify",async()=>{
  await withVerify(async calls=>{
    assert.equal((await qa.fetch(req(undefined,{origin:"https://untrusted.example"}),env)).status,403);
    assert.equal(calls(),0);
  });
});
