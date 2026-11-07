// Staging-only static integration checks against real repository HTML form definitions.
// No requests are sent to the live lead Worker, Turnstile, Make or Zoho.
// Run: node --test security/combined-contact-protection/business-lead/site-contract.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const WORKER_URL = "https://suncoast-lead-form.iammoeskicova0808.workers.dev/";
const SITEKEY = "0x4AAAAAACzrFz4NsVodL59R"; // Public widget sitekey, NOT a secret.
const expectedPages = [
  "business-security.html",
  "index.html",
  "it-support/index.html",
  "managed-it/index.html",
  "microsoft-365/index.html",
  "office-networking/index.html",
  "reviews/index.html",
  "services/index.html",
  "wisp-compliance/index.html"
].sort();

function scanFiles(dir) {
  const files = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.name === ".git" || item.name === "node_modules") continue;
    const full = join(dir, item.name);
    if (item.isDirectory()) files.push(...scanFiles(full));
    else if (item.name.endsWith(".html")) files.push(full);
  }
  return files;
}
const all = scanFiles(ROOT).map(file => ({
  path: relative(ROOT, file).replaceAll("\\", "/"),
  html: readFileSync(file, "utf8")
}));
const forms = all.flatMap(page => [...page.html.matchAll(/<form\\b[^>]*>[\\s\\S]*?<\\/form>/gi)]
  .map(match => ({ path: page.path, html: match[0], pageHTML: page.html })));
const leadForms = forms.filter(f => f.html.includes("suncoast-lead-form.iammoeskicova0808.workers.dev"));

test("all nine observed business-form entry pages remain covered", () => {
  assert.deepEqual(leadForms.map(f => f.path).sort(), expectedPages);
  assert.equal(leadForms.length, 9, "Expected one form on each of the nine pages");
});
test("every business form keeps the existing POST endpoint and Turnstile widget", () => {
  for (const {path, html} of leadForms) {
    assert.match(html, /\\bmethod="POST"/i, path);
    assert.ok(html.includes(`action="${WORKER_URL}"`), `${path}: action changed`);
    assert.ok(html.includes("cf-turnstile"), `${path}: Turnstile missing`);
    assert.ok(html.includes(`data-sitekey="${SITEKEY}"`), `${path}: unexpected widget`);
  }
});
test("all business forms capture required identity fields", () => {
  for (const {path, html} of leadForms) {
    assert.match(html, /\\bname="name"/, path);
    assert.match(html, /\\bname="email"/, path);
  }
});
test("every form retains source and page identity fields for Make", () => {
  for (const {path, html} of leadForms) {
    assert.match(html, /\\bname="lead_source"/, path);
    assert.match(html, /\\bname="page_name"/, path);
  }
});
test("review form retains its special feedback-to-help mapping", () => {
  const review=leadForms.find(f=>f.path==="reviews/index.html");
  assert.ok(review);
  assert.match(review.html,/\\bname="review_rating"/);
  assert.match(review.html,/\\bname="publish_consent"/);
  assert.match(review.html,/\\bname="help"/);
  assert.ok(review.pageHTML.includes("Customer website review"));
  assert.ok(review.pageHTML.includes("message.value="), "review script no longer composes feedback");
});
test("WISP form omits help and is supported by optional-field handling", () => {
  const wisp=leadForms.find(f=>f.path==="wisp-compliance/index.html");
  assert.ok(wisp);
  assert.doesNotMatch(wisp.html,/\\bname="help"/);
  const worker=readFileSync(join(ROOT,"security/combined-contact-protection/business-lead/index.js"),"utf8");
  assert.match(worker,/help:\\s*field\\(formData,\\s*"help",/);
  assert.match(worker,/source:\\s*field\\(formData,\\s*"lead_source",/);
});
test("business Worker remains compatible with public browser submissions", () => {
  const worker=readFileSync(join(ROOT,"security/combined-contact-protection/business-lead/index.js"),"utf8");
  assert.doesNotMatch(worker,/LEAD_GATEWAY_SECRET|X-Suncoast-OTP-Gateway-Secret/);
  assert.match(worker,/outcome\\.hostname === FORM_HOSTNAME/);
  assert.match(worker,/Response\\.redirect\\(THANK_YOU_URL, 302\\)/);
  assert.match(worker,/env\\.TURNSTILE_SECRET/);
  assert.match(worker,/env\\.MAKE_WEBHOOK_URL/);
});
