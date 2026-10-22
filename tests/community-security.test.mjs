import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSessionCookie, createCommunityRequestFingerprint, createOtp, createSessionToken,
  digestOtp, digestSessionToken, getCommunityDestination, normalizeCommunityEmail,
  parseSessionCookie, serializeSessionCookie, validateChannelSlug
} from '../lib/community-security.mjs';

test('normalizes valid email and rejects malformed values', () => {
  assert.equal(normalizeCommunityEmail('  Author@Example.COM '), 'author@example.com');
  assert.throws(() => normalizeCommunityEmail('not-an-email'), /valid email/i);
});

test('uses an exact server-owned destination allowlist', () => {
  assert.equal(validateChannelSlug('writers-room'), 'writers-room');
  assert.equal(getCommunityDestination('community'), 'https://writers-block.beehiiv.com/community');
  assert.equal(getCommunityDestination('italus-bookshelf'), 'https://writers-block.beehiiv.com/community/channels/italus-bookshelf');
  assert.throws(() => getCommunityDestination('https://evil.example'), /destination/i);
});

test('creates six-digit OTPs and secret-bound deterministic digests', () => {
  assert.match(createOtp(), /^\d{6}$/);
  assert.equal(digestOtp('123456', 'challenge', 'secret'), digestOtp('123456', 'challenge', 'secret'));
  assert.notEqual(digestOtp('123456', 'challenge', 'secret'), digestOtp('123456', 'challenge', 'other'));
});

test('creates high-entropy session tokens and secure cookie values', () => {
  const token = createSessionToken();
  assert.ok(token.length >= 43);
  assert.notEqual(token, createSessionToken());
  assert.equal(digestSessionToken(token, 'secret'), digestSessionToken(token, 'secret'));
  const cookie = serializeSessionCookie(token, new Date('2026-11-21T00:00:00Z'));
  assert.match(cookie, /^italus_community_session=/);
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax; Path=\//);
  assert.equal(parseSessionCookie({ cookie: `x=1; ${cookie.split(';')[0]}` }), token);
  assert.equal(parseSessionCookie({ cookie: 'italus_community_session=%ZZ' }), null);
  assert.match(clearSessionCookie(), /Max-Age=0/);
});

test('fingerprints requests without exposing the source value', () => {
  const value = createCommunityRequestFingerprint('203.0.113.1', 'agent', 'secret');
  assert.match(value, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(value, /203\.0\.113\.1/);
});
