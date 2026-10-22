import test from 'node:test';
import assert from 'node:assert/strict';

import { createAdminWaitlistHandler } from '../api/admin-waitlist.mjs';

const entry = {
  id: 7,
  email: 'ada@example.com',
  name: '<Ada & Co>',
  genre: 'Fantasy',
  source: 'updates',
  marketingOptIn: true,
  marketingConsentAt: new Date('2026-10-20T10:00:00Z'),
  beehiivSyncStatus: 'synced',
  createdAt: new Date('2026-10-20T09:00:00Z')
};

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    send(value) { this.body = value; return this; },
    end(value = '') { this.body = value; return this; }
  };
}

function auth(username = 'admin', password = 'correct-password') {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function request(overrides = {}) {
  return {
    method: 'GET',
    headers: { 'x-forwarded-for': '203.0.113.9' },
    query: {},
    ...overrides
  };
}

function setup(overrides = {}) {
  const calls = { rateLimits: [], lists: 0, counts: 0 };
  const store = {
    async checkRateLimit(key, action) { calls.rateLimits.push([key, action]); return true; },
    async listEntries() { calls.lists += 1; return [entry]; },
    async countEntries() { calls.counts += 1; return 1; },
    ...overrides.store
  };
  const handler = createAdminWaitlistHandler({
    store,
    communityStore: overrides.communityStore,
    env: {
      WAITLIST_ADMIN_USERNAME: 'admin',
      WAITLIST_ADMIN_PASSWORD: 'correct-password',
      WAITLIST_IP_HASH_SECRET: 'hash-secret',
      ...overrides.env
    }
  });
  return { handler, calls };
}

test('renders separate escaped community acceptance evidence without security digests', async () => {
  const { handler } = setup({ communityStore: { async listEvidence() { return [{ email: '<author@example.com>', status: 'active', termsVersion: '1.0', acceptedAt: new Date('2026-10-22T12:00:00Z'), latestEvent: 'trusted_access', latestEventAt: new Date('2026-10-22T13:00:00Z') }]; } } });
  const res = await invoke(handler, request({ headers: { authorization: auth(), 'x-forwarded-for': '203.0.113.9' } }));
  assert.match(res.body, /Community acceptance evidence/);
  assert.match(res.body, /&lt;author@example\.com&gt;/);
  assert.match(res.body, /trusted_access/);
  assert.doesNotMatch(res.body, /token_digest|request_fingerprint|user_agent_hash/);
});

async function invoke(handler, req) {
  const res = response();
  await handler(req, res);
  return res;
}

test('rejects missing, malformed, and incorrect Basic Authentication without exposing data', async () => {
  for (const authorization of [undefined, 'Bearer nope', auth('admin', 'wrong')]) {
    const { handler, calls } = setup();
    const headers = { 'x-forwarded-for': '203.0.113.9' };
    if (authorization) headers.authorization = authorization;
    const res = await invoke(handler, request({ headers }));
    assert.equal(res.statusCode, 401);
    assert.match(res.headers['www-authenticate'], /^Basic /);
    assert.doesNotMatch(String(res.body), /ada@example|correct-password/);
    assert.equal(calls.lists, 0);
    assert.equal(calls.rateLimits[0][1], 'admin_auth');
  }
});

test('throttles failed administrator logins independently', async () => {
  const { handler } = setup({ store: { async checkRateLimit() { return false; } } });
  const res = await invoke(handler, request({ headers: { authorization: auth('admin', 'wrong'), 'x-forwarded-for': '203.0.113.9' } }));
  assert.equal(res.statusCode, 429);
  assert.match(String(res.body), /Too many attempts/);
});

test('valid authentication does not consume failed-login rate limit', async () => {
  const { handler, calls } = setup();
  const res = await invoke(handler, request({ headers: { authorization: auth(), 'x-forwarded-for': '203.0.113.9' } }));
  assert.equal(res.statusCode, 200);
  assert.equal(calls.rateLimits.length, 0);
});

test('fails closed when administrator security configuration is incomplete', async () => {
  const { handler, calls } = setup({ env: { WAITLIST_ADMIN_PASSWORD: '' } });
  const res = await invoke(handler, request({ headers: { authorization: auth(), 'x-forwarded-for': '203.0.113.9' } }));
  assert.equal(res.statusCode, 503);
  assert.doesNotMatch(String(res.body), /DATABASE|PASSWORD|correct-password/);
  assert.equal(calls.lists, 0);
});

test('renders an escaped, newest-first administrator table and security headers', async () => {
  const older = { ...entry, id: 6, email: 'older@example.com', name: 'Older', createdAt: new Date('2026-10-19T09:00:00Z'), marketingOptIn: false, beehiivSyncStatus: 'not_requested' };
  const { handler } = setup({ store: {
    async listEntries() { return [entry, older]; },
    async countEntries() { return 2; }
  } });
  const res = await invoke(handler, request({ headers: { authorization: auth(), 'x-forwarded-for': '203.0.113.9' } }));
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.equal(res.headers['cache-control'], 'private, no-store');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow, noarchive');
  assert.match(res.headers['content-security-policy'], /default-src 'none'/);
  assert.match(res.body, /2 waitlist entries/);
  assert.match(res.body, /&lt;Ada &amp; Co&gt;/);
  assert.doesNotMatch(res.body, /<Ada & Co>/);
  assert.ok(res.body.indexOf('ada@example.com') < res.body.indexOf('older@example.com'));
  assert.match(res.body, /Marketing: yes/);
  assert.match(res.body, /Beehiiv: synced/);
});

test('protects CSV export and neutralizes spreadsheet formulas', async () => {
  const dangerous = { ...entry, email: '=IMPORTXML@example.com', name: '+cmd' };
  const { handler } = setup({ store: { async listEntries() { return [dangerous]; } } });
  const denied = await invoke(handler, request({ query: { format: 'csv' } }));
  assert.equal(denied.statusCode, 401);
  assert.doesNotMatch(String(denied.body), /IMPORTXML/);

  const allowed = await invoke(handler, request({
    headers: { authorization: auth(), 'x-forwarded-for': '203.0.113.9' },
    query: { format: 'csv' }
  }));
  assert.equal(allowed.statusCode, 200);
  assert.match(allowed.headers['content-type'], /text\/csv/);
  assert.match(allowed.headers['content-disposition'], /attachment/);
  assert.match(allowed.body, /"'=IMPORTXML@example.com"/);
  assert.match(allowed.body, /"'\+cmd"/);
});

test('rejects unsupported methods', async () => {
  const { handler } = setup();
  const res = await invoke(handler, request({ method: 'POST' }));
  assert.equal(res.statusCode, 405);
});
