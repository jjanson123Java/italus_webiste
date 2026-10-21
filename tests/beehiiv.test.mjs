import test from 'node:test';
import assert from 'node:assert/strict';
import { createBeehiivClient } from '../lib/beehiiv.mjs';

test('subscribes with consent-safe Beehiiv settings and source attribution', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ data: { id: 'sub_123' } }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  };
  const client = createBeehiivClient({ fetchImpl, apiKey: 'secret-key', publicationId: 'pub_123' });

  const result = await client.subscribe({ email: 'ada@example.com', name: 'Ada Author', source: 'updates' });
  const body = JSON.parse(request.options.body);

  assert.equal(result.subscriptionId, 'sub_123');
  assert.equal(request.url, 'https://api.beehiiv.com/v2/publications/pub_123/subscriptions');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.authorization, 'Bearer secret-key');
  assert.equal(body.email, 'ada@example.com');
  assert.equal(body.reactivate_existing, false);
  assert.equal(body.double_opt_override, 'on');
  assert.equal(body.send_welcome_email, true);
  assert.equal(body.utm_source, 'italus_updates');
  assert.deepEqual(body.custom_fields, [{ name: 'name', value: 'Ada Author' }]);
});

test('fails closed when Beehiiv configuration is missing', () => {
  assert.throws(() => createBeehiivClient({ apiKey: '', publicationId: 'pub_123' }), /not configured/i);
  assert.throws(() => createBeehiivClient({ apiKey: 'key', publicationId: '' }), /not configured/i);
});

test('returns sanitized errors for non-success and malformed responses', async () => {
  const rejected = createBeehiivClient({
    apiKey: 'do-not-leak',
    publicationId: 'pub_123',
    fetchImpl: async () => new Response('provider detail', { status: 401 })
  });
  const malformed = createBeehiivClient({
    apiKey: 'do-not-leak',
    publicationId: 'pub_123',
    fetchImpl: async () => new Response(JSON.stringify({ data: {} }), { status: 201 })
  });

  await assert.rejects(rejected.subscribe({ email: 'a@example.com', name: 'A', source: 'home' }), (error) => {
    assert.match(error.message, /could not be completed/i);
    assert.doesNotMatch(error.message, /do-not-leak|provider detail/);
    return true;
  });
  await assert.rejects(malformed.subscribe({ email: 'a@example.com', name: 'A', source: 'home' }), /invalid response/i);
});

test('aborts a Beehiiv request that exceeds the timeout', async () => {
  const fetchImpl = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  });
  const client = createBeehiivClient({
    fetchImpl,
    apiKey: 'secret-key',
    publicationId: 'pub_123',
    timeoutMs: 5
  });

  await assert.rejects(
    client.subscribe({ email: 'a@example.com', name: 'A', source: 'home' }),
    /timed out/i
  );
});
