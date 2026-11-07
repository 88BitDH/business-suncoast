/**
 * STAGED PROTOTYPE ONLY — DO NOT DEPLOY.
 * Intended route: business.suncoasttechsupport.net/api/email-reveal.
 * Encrypted bindings: TURNSTILE_SECRET, SALES_EMAIL, PARTNERS_EMAIL.
 * Before activation: remove public email references, configure rate limiting,
 * verify the Turnstile widget action/hostname, and test live.
 */
const SITE_ORIGIN = 'https://business.suncoasttechsupport.net';
const EXPECTED_HOST = 'business.suncoasttechsupport.net';
const EXPECTED_PATH = '/api/email-reveal';
const EXPECTED_ACTION = 'email_reveal';
const MAX_BODY_CHARS = 4096;

export default {
  async fetch(request, env) {
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Vary': 'Origin',
    };
    const reply = (status, payload) => new Response(JSON.stringify(payload), { status, headers });
    const target = new URL(request.url);
    if (target.hostname !== EXPECTED_HOST || target.pathname !== EXPECTED_PATH || target.protocol !== 'https:') {
      return reply(404, { error: 'Not found' });
    }
    if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
    // Origin is a secondary safeguard, NOT authentication: scripts can forge it.
    if (request.headers.get('Origin') !== SITE_ORIGIN) return reply(403, { error: 'Request rejected' });
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') || '')) {
      return reply(415, { error: 'Unsupported content type' });
    }
    if (!env?.TURNSTILE_SECRET || !env?.SALES_EMAIL || !env?.PARTNERS_EMAIL) {
      return reply(503, { error: 'Service temporarily unavailable' });
    }
    let payload;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_CHARS) return reply(413, { error: 'Request too large' });
      payload = JSON.parse(raw);
    } catch {
      return reply(400, { error: 'Invalid request' });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return reply(400, { error: 'Invalid request' });
    }
    if (!['sales', 'partners'].includes(payload.mailbox) ||
        typeof payload.token !== 'string' || !payload.token.trim() || payload.token.length > 2048) {
      return reply(400, { error: 'Invalid verification details' });
    }
    let verification;
    try {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: payload.token }),
      });
      if (!response.ok) return reply(503, { error: 'Verification unavailable' });
      verification = await response.json();
    } catch {
      return reply(503, { error: 'Verification unavailable' });
    }
    if (verification?.success !== true || verification.hostname !== EXPECTED_HOST ||
        verification.action !== EXPECTED_ACTION) {
      return reply(403, { error: 'Verification failed' });
    }
    const email = payload.mailbox === 'sales' ? env.SALES_EMAIL : env.PARTNERS_EMAIL;
    return reply(200, { email });
  },
};
