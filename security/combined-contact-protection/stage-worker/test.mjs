// Node 22, offline isolated QA Worker test. Network calls mocked.
import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";

const host="suncoast-lead-form-qa-20261107.iammoeskicova0808.workers.dev";
const base="https://"+host;
const webhook="https://hook.us2.make.com/SYNTHETIC_EXAMPLE_NOT_REAL";
const env={TURNSTILE_SECRET:"TEST_SECRET_NOT_REAL",MAKE_WEBHOOK_URL:webhook};
const fields={
 name:"Suncoast QA",email:"qa@example.test",phone:"",
 help:"SCQA-STAGE-20261107 — isolated test",
 lead_source:"Suncoast Stage QA",page_name:"Cloudflare Isolated QA Form",
 utm_source:"qa",utm_campaign:"stage-worker-20261107",utm_term:"",
 utm_medium:"test",landing_page:base+"/qa","cf-turnstile-response":"TEST_TOKEN_ONLY"
};
const post=(overrides={},url=base+"/submit")=>new Request(url,{method:"POST",body:new URLSearchParams({...fields,...overrides})});
async function mocked(fn,{hostname=host,verified=true,makeStatus=200}={}) {
 const saved=globalThis.fetch;const requests=[];
 globalThis.fetch=async (url,init)=>{
  requests.push({url:String(url),init});
  if(String(url).endsWith("/siteverify"))return Response.json({success:verified,hostname});
  if(String(url)===webhook)return new Response("accepted",{status:makeStatus});
  throw Error("Unexpected network call");
 };
 try {await fn(requests);} finally {globalThis.fetch=saved;}
}
test("GET /qa serves only synthetic QA form with staging Turnstile widget",async()=>{
 const resp=await worker.fetch(new Request(base+"/qa"),env);
 const html=await resp.text();
 assert.equal(resp.status,200);assert.match(html,/TEST ONLY/);
 assert.match(html,/0x4AAAAAAF33SThXCtZCseqm/);
 assert.match(html,/qa@example.test/);assert.match(html,/action="\/submit"/);
 assert.doesNotMatch(html,/hook\.us2\.make\.com/);
 assert.match(resp.headers.get("X-Robots-Tag"),/noindex/);
});
test("GET QA success page is isolated from live site conversion tracking",async()=>{
 const resp=await worker.fetch(new Request(base+"/qa/success"),env);
 assert.equal(resp.status,200);
 assert.doesNotMatch(await resp.text(),/AW-\d+|google-analytics|gtag/);
});
test("only staging host is accepted",async()=>{
 const resp=await worker.fetch(post({}, "https://unrelated.example/submit"),env);
 assert.equal(resp.status,404);
});
test("cannot accidentally submit customer identity or nonQA text",async()=>{
 await mocked(async calls=>{
  for(const invalid of [{email:"customer@example.com"},{name:"Prospect"},{help:"Real customer request"}]){
   assert.equal((await worker.fetch(post(invalid),env)).status,403);
  }
  assert.equal(calls.length,0);
 });
});
test("valid synthetic POST verifies real Siteverify response shape and forwards Make payload",async()=>{
 await mocked(async calls=>{
  const resp=await worker.fetch(post(),env);
  assert.equal(resp.status,302);
  assert.equal(resp.headers.get("location"),base+"/qa/success");
  assert.equal(calls.length,2);
  assert.equal(calls[0].init.body.get("response"),"TEST_TOKEN_ONLY");
  assert.equal(calls[1].url,webhook);
  const sent=JSON.parse(calls[1].init.body);
  assert.equal(sent.email,"qa@example.test");
  assert.equal(sent.source,"Suncoast Stage QA");
  assert.equal(Object.keys(sent).length,11);
 });
});
test("wrong Turnstile hostname rejects before Make",async()=>{
 await mocked(async calls=>{
  const resp=await worker.fetch(post(),env);
  assert.equal(resp.status,403);assert.equal(calls.length,1);
 },{hostname:"business.suncoasttechsupport.net"});
});
test("Turnstile failed token rejects before Make",async()=>{
 await mocked(async calls=>{
  const resp=await worker.fetch(post(),env);
  assert.equal(resp.status,403);assert.equal(calls.length,1);
 },{verified:false});
});
test("Make error does not redirect as success",async()=>{
 await mocked(async calls=>{
  const resp=await worker.fetch(post(),env);
  assert.equal(resp.status,500);assert.equal(calls.length,2);
 },{makeStatus:500});
});
test("missing credentials fail closed",async()=>{
 await mocked(async calls=>{
  const resp=await worker.fetch(post(),{});
  assert.equal(resp.status,503);assert.equal(calls.length,0);
 });
});
test("only explicit test routes are available",async()=>{
 const resp=await worker.fetch(new Request(base+"/"),env);
 assert.equal(resp.status,404);
});
