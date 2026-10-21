import test from 'node:test';
import assert from 'node:assert/strict';
import { createWaitlistHandler } from '../api/waitlist.mjs';

const validBody = {
  name: 'Ada Author',
  email: 'ada@example.com',
  genre: 'Fantasy',
  source: 'updates',
  marketingOptIn: false,
  website: ''
};

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end(value) { this.body = value; return this; }
  };
}

function request(overrides = {}) {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://italusbooks.com',
      'x-forwarded-for': '203.0.113.8'
    },
    body: validBody,
    ...overrides
  };
}

function dependencies(overrides = {}) {
  const calls = { upserts: [], subscribe: [], synced: [], failed: [], logs: [] };
  const store = {
    async checkRateLimit() { return true; },
    async upsertEntry(data) {
      calls.upserts.push(data);
      return { entry: data, shouldSyncBeehiiv: data.marketingOptIn };
    },
    async markBeehiivSynced(email, id) { calls.synced.push([email, id]); },
    async markBeehiivFailed(email) { calls.failed.push(email); },
    ...overrides.store
  };
  const beehiiv = {
    async subscribe(data) { calls.subscribe.push(data); return { subscriptionId: 'sub_123' }; },
    ...overrides.beehiiv
  };
  const logger = { error(...values) { calls.logs.push(values); } };
  return {
    calls,
    handler: createWaitlistHandler({
      store,
      beehiiv,
      logger,
      env: { WAITLIST_IP_HASH_SECRET: 'test-secret' }
    })
  };
}

async function invoke(handler, req = request()) {
  const res = createResponse();
  await handler(req, res);
  return res;
}

test('rejects unsupported methods and content types', async () => {
  const { handler } = dependencies();
  const method = await invoke(handler, request({ method: 'GET' }));
  const media = await invoke(handler, request({ headers: { ...request().headers, 'content-type': 'text/plain' } }));
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, 'POST');
  assert.equal(media.statusCode, 415);
});

test('rejects oversized, unapproved-origin, and invalid submissions', async () => {
  const { handler } = dependencies();
  const oversized = await invoke(handler, request({ headers: { ...request().headers, 'content-length': '5000' } }));
  const origin = await invoke(handler, request({ headers: { ...request().headers, origin: 'https://attacker.example' } }));
  const invalid = await invoke(handler, request({ body: { ...validBody, email: 'bad' } }));
  assert.equal(oversized.statusCode, 413);
  assert.equal(origin.statusCode, 403);
  assert.equal(invalid.statusCode, 400);
});

test('accepts approved production and project preview origins', async () => {
  for (const origin of [
    'https://www.italusbooks.com',
    'https://italus-website.vercel.app',
    'https://italus-website-git-main-like-tac.vercel.app'
  ]) {
    const { handler } = dependencies();
    const response = await invoke(handler, request({ headers: { ...request().headers, origin } }));
    assert.equal(response.statusCode, 200, origin);
  }
});

test('returns generic success for honeypots without writing', async () => {
  const { handler, calls } = dependencies();
  const response = await invoke(handler, request({ body: { ...validBody, website: 'spam.example' } }));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { ok: true, message: "You're on the Italus waitlist." });
  assert.equal(calls.upserts.length, 0);
});

test('applies request-key rate limits before writing', async () => {
  const { handler, calls } = dependencies({ store: { async checkRateLimit() { return false; } } });
  const response = await invoke(handler);
  assert.equal(response.statusCode, 429);
  assert.equal(calls.upserts.length, 0);
});

test('returns the same success response for new and duplicate addresses', async () => {
  const { handler } = dependencies({
    store: {
      async upsertEntry(data) { return { entry: data, shouldSyncBeehiiv: false }; }
    }
  });
  const first = await invoke(handler);
  const duplicate = await invoke(handler);
  assert.deepEqual(first.body, duplicate.body);
  assert.equal(first.headers['cache-control'], 'no-store');
  assert.equal(first.headers['x-content-type-options'], 'nosniff');
});

test('never calls Beehiiv for unchecked or already-recorded consent', async () => {
  const unchecked = dependencies();
  await invoke(unchecked.handler);
  assert.equal(unchecked.calls.subscribe.length, 0);

  const repeat = dependencies({
    store: { async upsertEntry(data) { return { entry: data, shouldSyncBeehiiv: false }; } }
  });
  await invoke(repeat.handler, request({ body: { ...validBody, marketingOptIn: true } }));
  assert.equal(repeat.calls.subscribe.length, 0);
});

test('syncs a newly recorded opt-in exactly once', async () => {
  const { handler, calls } = dependencies();
  const response = await invoke(handler, request({ body: { ...validBody, marketingOptIn: true } }));
  assert.equal(response.statusCode, 200);
  assert.equal(calls.subscribe.length, 1);
  assert.equal(calls.subscribe[0].reactivateExisting, false);
  assert.deepEqual(calls.synced, [['ada@example.com', 'sub_123']]);
});

test('forwards an explicit resubscription transition to Beehiiv', async () => {
  const { handler, calls } = dependencies({
    store: {
      async upsertEntry(data) {
        return { entry: data, shouldSyncBeehiiv: true, reactivateExisting: true };
      }
    }
  });

  const response = await invoke(handler, request({ body: { ...validBody, marketingOptIn: true } }));

  assert.equal(response.statusCode, 200);
  assert.equal(calls.subscribe.length, 1);
  assert.equal(calls.subscribe[0].reactivateExisting, true);
});

test('records Beehiiv failure without failing registration or leaking provider errors', async () => {
  const { handler, calls } = dependencies({
    beehiiv: { async subscribe() { throw new Error('provider secret detail'); } }
  });
  const response = await invoke(handler, request({ body: { ...validBody, marketingOptIn: true } }));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls.failed, ['ada@example.com']);
  assert.equal(calls.logs.length, 1);
  assert.doesNotMatch(JSON.stringify(calls.logs[0]), /provider secret detail|ada@example.com/);
});

test('logs only the failing phase and PostgreSQL code for a submission error', async () => {
  const databaseError = Object.assign(new Error('secret connection detail'), { code: '42501' });
  const { handler, calls } = dependencies({
    store: { async upsertEntry() { throw databaseError; } }
  });

  const response = await invoke(handler);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(calls.logs, [[
    'Waitlist submission failed.',
    { phase: 'upsert_entry', code: '42501' }
  ]]);
  assert.doesNotMatch(JSON.stringify(calls.logs), /secret connection detail|ada@example.com/);
});
