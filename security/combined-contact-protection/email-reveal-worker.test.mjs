// Offline test suite — no Cloudflare account resources or real credentials accessed.
// Run from this directory with Node 22+: node --test email-reveal-worker.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './email-reveal-worker.mjs';

const base = 'https://business.suncoasttechsupport.net/api/email-reveal';
const secret = 'test-secret-not-real';
const env = { TURNSTILE_SECRET: secret, SALES_EMAIL: 'sales@example.test', PARTNERS_EMAIL: 'partners@example.test' };
const makeReq = (body, options = {}) => new Request(options.url || base, {
  method: options.method || 'POST',
  headers: { Origin: options.origin || 'https://business.suncoasttechsupport.net', 'Content-Type': options.type || 'application/json' },
  ...(options.method === 'GET' ? {} : { body: JSON.stringify(body) }),
});
const valid = { mailbox: 'sales', token: 'one-time-turnstile-token' };

async function run(body, verification = { success: true, hostname: 'business.suncoasttechsupport.net', action: 'email_reveal' }, options = {}) {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(init.body.get('secret'), secret);
    return new Response(JSON.stringify(verification), { status: options.siteverifyStatus || 200 });
  };
  try { return { response: await worker.fetch(makeReq(body, options), options.env || env), calls }; }
  finally { globalThis.fetch = previous; }
}

test('valid token returns only selected mailbox with no-store headers', async () => {
  const { response, calls } = await run(valid);
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.deepEqual(await response.json(), { email: 'sales@example.test' });
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
});
test('partner mailbox is separated from sales', async () => {
  const { response } = await run({ ...valid, mailbox: 'partners' });
  assert.equal((await response.json()).email, 'partners@example.test');
});
test('origin mismatch rejected without Siteverify call', async () => {
  const { response, calls } = await run(valid, undefined, { origin: 'https://attacker.example' });
  assert.equal(response.status, 403); assert.equal(calls, 0);
});
test('workers.dev and wrong path requests rejected', async () => {
  for (const url of ['https://test.workers.dev/api/email-reveal', 'https://business.suncoasttechsupport.net/other']) {
    const { response, calls } = await run(valid, undefined, { url });
    assert.equal(response.status, 404); assert.equal(calls, 0);
  }
});
test('failed Turnstile rejected', async () => {
  const { response } = await run(valid, { success: false, hostname: 'business.suncoasttechsupport.net', action: 'email_reveal' });
  assert.equal(response.status, 403);
});
test('wrong Turnstile hostname rejected', async () => {
  const { response } = await run(valid, { success: true, hostname: 'other.example', action: 'email_reveal' });
  assert.equal(response.status, 403);
});
test('wrong Turnstile action rejected', async () => {
  const { response } = await run(valid, { success: true, hostname: 'business.suncoasttechsupport.net', action: 'contact_form' });
  assert.equal(response.status, 403);
});
test('invalid mailbox or missing token rejected without verification', async () => {
  for (const item of [{...valid, mailbox:'admin'}, {mailbox:'sales', token:''}]) {
    const { response, calls } = await run(item);
    assert.equal(response.status, 400); assert.equal(calls, 0);
  }
});
test('no secrets fails closed', async () => {
  const { response, calls } = await run(valid, undefined, { env: {} });
  assert.equal(response.status, 503); assert.equal(calls, 0);
});
test('Turnstile outage fails closed', async () => {
  const { response } = await run(valid, undefined, { siteverifyStatus: 500 });
  assert.equal(response.status, 503);
});
test('GET is rejected', async () => {
  const response = await worker.fetch(makeReq(undefined, { method: 'GET' }), env);
  assert.equal(response.status, 405);
});
