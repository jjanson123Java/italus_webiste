import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { Webhook } from 'svix';

import { createBeehiivWebhookHandler } from '../api/beehiiv-webhook.mjs';

const secret = `whsec_${Buffer.alloc(32, 7).toString('base64')}`;

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

function signedRequest(payload, { timestamp = new Date(), id = 'msg_123', method = 'POST' } = {}) {
  const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signature = new Webhook(secret).sign(id, timestamp, rawBody);
  return Object.assign(Readable.from([Buffer.from(rawBody)]), {
    method,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(rawBody)),
      'svix-id': id,
      'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'svix-signature': signature
    }
  });
}

function event(overrides = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    data: { email: ' Ada@Example.com ', id: 'sub_123' },
    event_timestamp: timestamp,
    event_type: 'subscription.deleted',
    uid: 'evt_123',
    ...overrides
  };
}

async function invoke(handler, req) {
  const res = response();
  await handler(req, res);
  return res;
}

function dependencies() {
  const calls = [];
  const logs = [];
  const handler = createBeehiivWebhookHandler({
    store: {
      async markBeehiivUnsubscribed(email, occurredAt) {
        calls.push([email, occurredAt]);
      }
    },
    env: { BEEHIIV_WEBHOOK_SECRET: secret },
    logger: { error(...values) { logs.push(values); } }
  });
  return { handler, calls, logs };
}

test('accepts only POST requests', async () => {
  const { handler, calls } = dependencies();
  const result = await invoke(handler, signedRequest(event(), { method: 'GET' }));
  assert.equal(result.statusCode, 405);
  assert.equal(result.headers.allow, 'POST');
  assert.equal(calls.length, 0);
});

test('rejects forged and stale signatures before database mutation', async () => {
  const forged = dependencies();
  const forgedRequest = signedRequest(event());
  forgedRequest.headers['svix-signature'] = 'v1,forged';
  const forgedResult = await invoke(forged.handler, forgedRequest);

  const stale = dependencies();
  const staleResult = await invoke(
    stale.handler,
    signedRequest(event(), { timestamp: new Date(Date.now() - 10 * 60 * 1000) })
  );

  assert.equal(forgedResult.statusCode, 401);
  assert.equal(staleResult.statusCode, 401);
  assert.equal(forged.calls.length, 0);
  assert.equal(stale.calls.length, 0);
});

test('verified subscription deletion records normalized email and provider event time', async () => {
  const { handler, calls } = dependencies();
  const payload = event({ event_timestamp: 1792602000 });
  const result = await invoke(handler, signedRequest(payload));

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'ada@example.com');
  assert.equal(calls[0][1].toISOString(), '2026-10-21T17:00:00.000Z');
});

test('acknowledges unrelated verified events without database mutation', async () => {
  const { handler, calls } = dependencies();
  const result = await invoke(handler, signedRequest(event({ event_type: 'subscription.confirmed' })));
  assert.equal(result.statusCode, 200);
  assert.equal(calls.length, 0);
});

test('rejects signed malformed JSON and malformed deletion payloads without leaking details', async () => {
  const malformedJson = dependencies();
  const badJsonResult = await invoke(malformedJson.handler, signedRequest('{bad json'));

  const malformedEvent = dependencies();
  const badEventResult = await invoke(
    malformedEvent.handler,
    signedRequest(event({ data: { id: 'sub_123' } }))
  );

  assert.equal(badJsonResult.statusCode, 400);
  assert.equal(badEventResult.statusCode, 400);
  assert.equal(malformedJson.calls.length, 0);
  assert.equal(malformedEvent.calls.length, 0);
  assert.doesNotMatch(JSON.stringify([...malformedJson.logs, ...malformedEvent.logs]), /ada@example\.com|\{bad json/);
});

test('repeated verified delivery remains safe for an idempotent store', async () => {
  const state = new Set();
  let transitions = 0;
  const handler = createBeehiivWebhookHandler({
    store: {
      async markBeehiivUnsubscribed(email) {
        if (!state.has(email)) transitions += 1;
        state.add(email);
      }
    },
    env: { BEEHIIV_WEBHOOK_SECRET: secret },
    logger: { error() {} }
  });
  const payload = event();

  const first = await invoke(handler, signedRequest(payload, { id: 'msg_repeat' }));
  const second = await invoke(handler, signedRequest(payload, { id: 'msg_repeat' }));

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(transitions, 1);
});
