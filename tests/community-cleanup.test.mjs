import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunityCleanupHandler } from '../api/community-cleanup.mjs';

function response() { return { statusCode: 0, headers: {}, setHeader(k,v){this.headers[k]=v;}, status(v){this.statusCode=v;return this;}, json(v){this.body=v;return this;} }; }
test('cleanup requires the cron bearer secret and applies only operational retention', async () => {
  let runs = 0; const store = { cleanup: async () => (runs++, { challengesDeleted: 2, sessionsDeleted: 1, eventsDeleted: 3 }) };
  let res = response(); await createCommunityCleanupHandler({ store, env: { CRON_SECRET: 'secret' } })({ method: 'GET', headers: {} }, res); assert.equal(res.statusCode, 401); assert.equal(runs, 0);
  res = response(); await createCommunityCleanupHandler({ store, env: { CRON_SECRET: 'secret' } })({ method: 'GET', headers: { authorization: 'Bearer secret' } }, res);
  assert.equal(res.statusCode, 200); assert.equal(runs, 1); assert.equal(res.headers['Cache-Control'], 'no-store'); assert.deepEqual(res.body.deleted, { challengesDeleted: 2, sessionsDeleted: 1, eventsDeleted: 3 });
});
