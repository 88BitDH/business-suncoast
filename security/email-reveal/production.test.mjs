import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "./worker.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const mail = ["sales", "partners"];
const host = "business.suncoasttechsupport.net";
const origin = "https://" + host;
const env = {
  TURNSTILE_SECRET: "QA_SECRET_NEVER_REAL",
  SALES_EMAIL: "sales@example.test",
  PARTNERS_EMAIL: "partners@example.test",
  EMAIL_REVEAL_LIMITER: { limit: async () => ({ success: true }) }
};
const input = { mailbox: "sales", token: "synthetic-turnstile-token" };
function req(payload=input, opts={}) {
  return new Request(opts.url || origin + "/api/email-reveal", {
    method: opts.method || "POST",
    headers: { "Origin": opts.origin || origin, "Content-Type": opts.contentType || "application/json" },
    ...(opts.method === "GET" ? {} : { body: JSON.stringify(payload) }),
  });
}
async function checked(payload=input, opts={}) {
  const originalFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async (url, init)=>{
    calls.push({url:String(url),init});
    if(String(url).includes("siteverify")) {
      if(opts.throwVerify) throw Error("Siteverify outage");
      return Response.json({success:opts.success!==false, hostname:opts.hostname||host, action:opts.action||"email_reveal"},{status:opts.verifyStatus||200});
    }
    throw Error("Unexpected external request");
  };
  try{return {response:await worker.fetch(req(payload,opts),opts.env||env),calls};}
  finally{globalThis.fetch=originalFetch;}
}
test("verified sales token reveals only sales alias, no cache or CORS", async()=>{
  const {response,calls}=await checked();
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{email:env.SALES_EMAIL});
  assert.match(response.headers.get("Cache-Control"),/no-store/);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"),null);
  assert.equal(calls.length,1);
  assert.equal(calls[0].init.body.get("secret"),env.TURNSTILE_SECRET);
});
test("verified partner reveals only partner alias",async()=>{
  const {response}=await checked({...input,mailbox:"partners"});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{email:env.PARTNERS_EMAIL});
});
test("invalid alias rejected before Siteverify",async()=>{
  const {response,calls}=await checked({...input,mailbox:"admin"});
  assert.equal(response.status,400);assert.equal(calls.length,0);
});
test("missing token rejected before Siteverify",async()=>{
  const {response,calls}=await checked({...input,token:""});
  assert.equal(response.status,400);assert.equal(calls.length,0);
});
test("wrong hostname rejects token",async()=>{
  const {response}=await checked(input,{hostname:"suncoasttechsupport.net"});
  assert.equal(response.status,403);
});
test("wrong action rejects token (cannot use contact-form token)",async()=>{
  const {response}=await checked(input,{action:"contact"});
  assert.equal(response.status,403);
});
test("invalid or replayed token fails closed",async()=>{
  const {response}=await checked(input,{success:false});
  assert.equal(response.status,403);
});
test("Siteverify outage fails closed",async()=>{
  const {response}=await checked(input,{throwVerify:true});
  assert.equal(response.status,503);
});
test("Siteverify non-200 fails closed",async()=>{
  const {response}=await checked(input,{verifyStatus:502});
  assert.equal(response.status,503);
});
test("unrecognized origin rejected before Siteverify",async()=>{
  const {response,calls}=await checked(input,{origin:"https://evil.example"});
  assert.equal(response.status,403);assert.equal(calls.length,0);
});
test("direct workers.dev hostname rejected",async()=>{
  const {response,calls}=await checked(input,{url:"https://email-reveal.workers.dev/api/email-reveal"});
  assert.equal(response.status,404);assert.equal(calls.length,0);
});
test("unknown path rejected",async()=>{
  const {response,calls}=await checked(input,{url:origin+"/wrong"});
  assert.equal(response.status,404);assert.equal(calls.length,0);
});
test("GET does not expose emails",async()=>{
  const response=await worker.fetch(req(input,{method:"GET"}),env);
  assert.equal(response.status,404);
});
test("content type must be JSON",async()=>{
  const {response}=await checked(input,{contentType:"text/plain"});
  assert.equal(response.status,415);
});
test("encrypted secret bindings missing -> closed",async()=>{
  const {response}=await checked(input,{env:{...env,SALES_EMAIL:""}});
  assert.equal(response.status,503);
});
test("rate limit binding missing -> closed",async()=>{
  const {response}=await checked(input,{env:{...env,EMAIL_REVEAL_LIMITER:null}});
  assert.equal(response.status,503);
});
test("rate limit rejects excessive requests",async()=>{
  const {response,calls}=await checked(input,{env:{...env,EMAIL_REVEAL_LIMITER:{limit:async()=>({success:false})}}});
  assert.equal(response.status,429);assert.equal(calls.length,0);
});
test("rate limiter outage -> closed",async()=>{
  const {response}=await checked(input,{env:{...env,EMAIL_REVEAL_LIMITER:{limit:async()=>{throw Error("unavailable");}}}});
  assert.equal(response.status,503);
});
test("source contains no actual mailbox addresses or secrets",()=>{
  const workerCode=readFileSync(join(ROOT,"security/email-reveal/worker.mjs"),"utf8");
  const client=readFileSync(join(ROOT,"assets/email-reveal.js"),"utf8");
  assert.doesNotMatch(workerCode+client,/(?:sales|partners|support)@suncoasttechsupport\.(?:com|net)/i);
  assert.doesNotMatch(workerCode,/0x4AAAAAAF4tQwhQiUBOGQe0/);
  assert.match(client,/action:\s*"email_reveal"/);
  assert.match(workerCode,/result\.action !== ACTION/);
});

const pages=[
"about/index.html",
"alerts/bank-phishing-fake-suspended-pages/index.html",
"alerts/business-email-compromise/index.html",
"alerts/fake-tech-support-scams/index.html",
"alerts/index.html",
"business-security.html",
"client-authorization/index.html",
"index.html",
"it-support/index.html",
"managed-it/index.html",
"microsoft-365/index.html",
"office-networking/index.html",
"privacy/index.html",
"reviews/index.html",
"services/index.html",
"terms/index.html",
"thank-you.html",
"wisp-compliance/index.html"
];
test("all 18 full business pages have the verified-email UI assets and no raw addresses",()=>{
  for(const path of pages){
    const html=readFileSync(join(ROOT,path),"utf8");
    assert.match(html,/data-email-reveal="sales"/,path);
    assert.match(html,/assets\/email-reveal\.css\?v=20261108-guarded/,path);
    assert.match(html,/assets\/email-reveal\.js\?v=20261108-guarded/,path);
    assert.doesNotMatch(html,/(?:sales|partners|support)@suncoasttechsupport\.(?:com|net)/i,path);
    assert.doesNotMatch(html,/mailto:/i,path);
    assert.match(html,/tel:17276479000/,path);
    assert.match(html,/sms:17276479000/,path);
  }
});
test("business homepage and About page retain partner contact via protected control",()=>{
  for(const path of ["index.html","about/index.html"]){
    const html=readFileSync(join(ROOT,path),"utf8");
    assert.match(html,/data-email-reveal="partners"/);
  }
});
test("nine existing business forms and their Turnstile widget remain untouched",()=>{
  const forms=["index.html","business-security.html","it-support/index.html","managed-it/index.html",
    "microsoft-365/index.html","office-networking/index.html","reviews/index.html",
    "services/index.html","wisp-compliance/index.html"];
  for(const path of forms){
    const html=readFileSync(join(ROOT,path),"utf8");
    assert.match(html,/action="https:\/\/suncoast-lead-form\.iammoeskicova0808\.workers\.dev\/"/,path);
    assert.match(html,/data-sitekey="0x4AAAAAACzrFz4NsVodL59R"/,path);
  }
});

test("Nov 8 Google Ads conversion label unchanged on all three conversion pages",()=>{
 const label="AW-17992501324/keBHCPWnk5McEMyQv4ND";
 for(const path of ["index.html","thank-you.html","wisp-compliance/index.html"]){
  assert.ok(readFileSync(join(ROOT,path),"utf8").includes(label),path);
 }
});
test("SMS and privacy requests use existing contact form, not a hidden sales mailbox",()=>{
 const privacy=readFileSync(join(ROOT,"privacy/index.html"),"utf8");
 assert.match(privacy,/href="\/#contact"/);
 assert.doesNotMatch(privacy,/support@suncoasttechsupport\.net/i);
 assert.doesNotMatch(privacy,/contact(?:ing)? us using the <button/i);
});
test("latest shared mobile navigation and contact click tracking retained",()=>{
 const js=readFileSync(join(ROOT,"assets/site-shell.js"),"utf8");
 assert.match(js,/sc-mobile-menu/);
 assert.match(js,/phone_click/);
 for(const path of pages){
  const html=readFileSync(join(ROOT,path),"utf8");
  assert.match(html,/\/assets\/site-shell\.js\?v=20261108-phone-conversion/,path);
 }
});
