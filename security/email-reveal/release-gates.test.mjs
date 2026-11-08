import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>readFileSync(join(root,p),"utf8");
const plan=JSON.parse(read("security/email-reveal/release-plan.json"));
const articles=JSON.parse(read("security/email-reveal/scheduled-patches/manifest.json"));
const pages=[
"about/index.html","alerts/bank-phishing-fake-suspended-pages/index.html",
"alerts/business-email-compromise/index.html","alerts/fake-tech-support-scams/index.html",
"alerts/index.html","business-security.html","client-authorization/index.html",
"index.html","it-support/index.html","managed-it/index.html","microsoft-365/index.html",
"office-networking/index.html","privacy/index.html","reviews/index.html",
"services/index.html","terms/index.html","thank-you.html","wisp-compliance/index.html"];
test("release config is review-only and has no embedded mailbox credentials",()=>{
 assert.equal(plan.document_status,"preflight_design_only_not_approved");
 assert.equal(plan.script_does_not_deploy,true);
 assert.equal(plan.worker.public_workers_dev,false);
 assert.equal(plan.worker.route,"business.suncoasttechsupport.net/api/email-reveal");
 assert.equal(plan.cloudflare_widget.required_action,"email_reveal");
 assert.deepEqual(plan.bindings.map(x=>x.name).sort(),
 ["EMAIL_REVEAL_LIMITER","PARTNERS_EMAIL","SALES_EMAIL","TURNSTILE_SECRET"].sort());
 assert.ok(plan.bindings.every(x=>x.type!=="secret_text"||x.value_in_git===false));
 assert.doesNotMatch(JSON.stringify(plan),/(?:sales|partners)@suncoasttechsupport\.(?:com|net)/i);
});
test("latest production mobile menu and click-tracking scripts remain on every staged page",()=>{
 const shared=read("assets/site-shell.js");
 assert.match(shared,/sc-mobile-menu/);
 assert.match(shared,/phone_click/);
 for(const page of pages){
  const s=read(page);
  assert.match(s,/\/assets\/site-shell\.js\?v=20261108-mobile-contact/,page);
  assert.match(s,/\/assets\/site-shell\.css\?v=20261108-mobile-contact/,page);
  assert.match(s,/\/assets\/email-reveal\.js\?v=20261108-guarded/,page);
  assert.match(s,/data-email-reveal="sales"/,page);
 }
});
test("seven future article templates retain mobile menu, click-tracking and protected email",()=>{
 assert.equal(articles.files.length,7);
 for(const article of articles.files){
  const s=read(article.stagedTemplate);
  assert.match(s,/\/assets\/site-shell\.js\?v=20261108-mobile-contact/,article.stagedTemplate);
  assert.match(s,/\/assets\/site-shell\.css\?v=20261108-mobile-contact/,article.stagedTemplate);
  assert.match(s,/data-email-reveal="sales"/,article.stagedTemplate);
  assert.doesNotMatch(s,/mailto:/,article.stagedTemplate);
 }
});
test("production server handler remains fail-closed for missing rate limiter and invalid hostname",()=>{
 const code=read("security/email-reveal/worker.mjs");
 assert.match(code,/EMAIL_REVEAL_LIMITER/);
 assert.match(code,/result\.hostname !== HOSTNAME/);
 assert.match(code,/result\.action !== ACTION/);
 assert.match(code,/json\(429,/);
 assert.match(code,/json\(503,/);
});
