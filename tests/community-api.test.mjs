import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunityAccessStartHandler } from '../api/community-access-start.mjs';
import { createCommunityAccessVerifyHandler } from '../api/community-access-verify.mjs';
import { createCommunityAccessHandler } from '../api/community-access.mjs';
import { createCommunityLogoutHandler } from '../api/community-access-logout.mjs';

const env = { COMMUNITY_OTP_SECRET: 'otp-secret', COMMUNITY_SESSION_SECRET: 'session-secret', COMMUNITY_REQUEST_HASH_SECRET: 'request-secret' };
function response() {
  return { statusCode: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
function request(body = {}, headers = {}) { return { method: 'POST', body, headers: { origin: 'https://italusbooks.com', 'content-type': 'application/json', 'user-agent': 'test-agent', 'x-forwarded-for': '203.0.113.10', ...headers } }; }

test('start issues one terms-bound challenge and sends a generic email response', async () => {
  const calls = [];
  const store = { checkRateLimit: async (...args) => (calls.push(['limit', ...args]), true), replaceChallenge: async (data) => (calls.push(['replace', data]), data) };
  const mailer = { sendCode: async (data) => calls.push(['mail', data]) };
  const res = response();
  await createCommunityAccessStartHandler({ store, mailer, env, now: () => new Date('2026-10-22T12:00:00Z'), randomId: () => 'challenge-1', createCode: () => '123456' })(request({ email: ' Author@Example.com ', channel: 'writers-room' }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, challengeId: 'challenge-1', message: 'If the address can receive mail, a verification code is on its way.' });
  assert.equal(calls.filter(([type]) => type === 'limit').length, 2);
  assert.equal(calls.find(([type]) => type === 'replace')[1].email, 'author@example.com');
  assert.equal(calls.find(([type]) => type === 'replace')[1].termsVersion, '1.0');
  assert.equal(calls.find(([type]) => type === 'mail')[1].code, '123456');
});

test('start rejects unknown destinations, unapproved origins, and exhausted limits', async () => {
  const base = { replaceChallenge: async () => assert.fail('must not write') };
  let res = response();
  await createCommunityAccessStartHandler({ store: { ...base, checkRateLimit: async () => true }, mailer: {}, env })(request({ email: 'a@b.com', channel: 'https://evil.example' }), res);
  assert.equal(res.statusCode, 400);
  res = response();
  await createCommunityAccessStartHandler({ store: { ...base, checkRateLimit: async () => true }, mailer: {}, env })(request({ email: 'a@b.com', channel: 'community' }, { origin: 'https://evil.example' }), res);
  assert.equal(res.statusCode, 403);
  res = response();
  await createCommunityAccessStartHandler({ store: { ...base, checkRateLimit: async () => false }, mailer: {}, env })(request({ email: 'a@b.com', channel: 'community' }), res);
  assert.equal(res.statusCode, 429);
});

test('verify rejects absent consent and bad codes without recording acceptance', async () => {
  let completed = false;
  const store = { findChallenge: async () => ({ id: 'c1', codeDigest: 'wrong', failedAttempts: 0, expiresAt: new Date(Date.now() + 60_000), termsVersion: '1.0', documentSha256: '3d606a955495b67b426c09c234891fc6c84059bacb7de127de8e2c5a0fe453ee', channel: 'community' }), recordFailedAttempt: async () => {}, completeVerification: async () => { completed = true; } };
  let res = response();
  await createCommunityAccessVerifyHandler({ store, env })(request({ challengeId: 'c1', code: '123456', accepted: false, ageConfirmed: true }), res);
  assert.equal(res.statusCode, 400);
  res = response();
  await createCommunityAccessVerifyHandler({ store, env })(request({ challengeId: 'c1', code: '123456', accepted: true, ageConfirmed: true }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(completed, false);
});

test('verify atomically creates acceptance/session and returns only allowlisted destination', async () => {
  let completed;
  const store = {
    findChallenge: async () => ({ id: 'c1', codeDigest: 'digest', failedAttempts: 0, expiresAt: new Date(Date.now() + 60_000), termsVersion: '1.0', documentSha256: '3d606a955495b67b426c09c234891fc6c84059bacb7de127de8e2c5a0fe453ee', channel: 'writers-room' }),
    completeVerification: async (data) => (completed = data, { email: 'author@example.com' })
  };
  const res = response();
  await createCommunityAccessVerifyHandler({ store, env, digestCode: () => 'digest', createToken: () => 'token', now: () => new Date('2026-10-22T12:00:00Z') })(request({ challengeId: 'c1', code: '123456', accepted: true, ageConfirmed: true }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.destination, 'https://writers-block.beehiiv.com/community/channels/writer-s-room');
  assert.match(res.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Lax/);
  assert.equal(completed.challengeId, 'c1');
});

test('trusted access requires a valid current session, records reuse, and rejects unknown channels', async () => {
  const events = [];
  const store = { checkRateLimit: async () => true, findTrustedSession: async () => ({ email: 'author@example.com', termsVersion: '1.0' }), recordAccess: async (event) => events.push(event) };
  let res = response();
  await createCommunityAccessHandler({ store, env })(request({ channel: 'community' }, { cookie: 'italus_community_session=token' }), res);
  assert.equal(res.body.destination, 'https://writers-block.beehiiv.com/community');
  assert.equal(events[0].eventType, 'trusted_access');
  res = response();
  await createCommunityAccessHandler({ store, env })(request({ channel: 'bad' }, { cookie: 'italus_community_session=token' }), res);
  assert.equal(res.statusCode, 400);
});

test('logout revokes the presented session and always clears the cookie', async () => {
  let digest;
  const res = response();
  await createCommunityLogoutHandler({ store: { revokeSession: async (value) => { digest = value; } }, env })(request({}, { cookie: 'italus_community_session=token' }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(digest);
  assert.match(res.headers['Set-Cookie'], /Max-Age=0/);
});
