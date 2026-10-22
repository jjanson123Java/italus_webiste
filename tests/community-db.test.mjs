import test from 'node:test';
import assert from 'node:assert/strict';

import { createCommunityStore } from '../lib/community-db.mjs';

function fakeSql(respond) {
  return {
    calls: [],
    async query(text, params = []) {
      this.calls.push({ text, params });
      return { rows: await respond(text, params) };
    }
  };
}

const now = new Date('2026-10-22T18:00:00.000Z');

test('rate limiting records only requests below the supplied fixed window limit', async () => {
  const sql = fakeSql((text) => text.includes('community_rate_limit') ? [{ allowed: true }] : []);
  const store = createCommunityStore({ sql, now: () => now });
  assert.equal(await store.checkRateLimit('opaque', 'otp_start_ip', 20, 60), true);
  assert.match(sql.calls.at(-1).text, /total < \$4/i);
  assert.deepEqual(sql.calls.at(-1).params.slice(0, 4), ['opaque', 'otp_start_ip', new Date('2026-10-22T17:00:00.000Z'), 20]);
});

test('replacing a challenge invalidates every older active challenge for the normalized email', async () => {
  const sql = fakeSql((text, params) => text.includes('replace_challenge') ? [{
    id: params[0], email: params[1], destination_channel: params[5], expires_at: params[6], resend_after: params[7]
  }] : []);
  const store = createCommunityStore({ sql, now: () => now });
  const challenge = await store.replaceChallenge({
    id: 'challenge_1', email: 'author@example.com', codeDigest: 'digest', termsVersion: '1.0',
    documentSha256: 'a'.repeat(64), channel: 'writers-room', expiresAt: new Date('2026-10-22T18:10:00Z'),
    resendAfter: new Date('2026-10-22T18:01:00Z'), requestFingerprint: 'fingerprint'
  });
  assert.equal(challenge.id, 'challenge_1');
  assert.match(sql.calls.at(-1).text, /UPDATE italus_community\.email_challenges[\s\S]*consumed_at[\s\S]*INSERT INTO italus_community\.email_challenges/i);
  assert.match(sql.calls.at(-1).text, /WHERE email = \$2 AND consumed_at IS NULL/i);
});

test('successful verification is one atomic statement that consumes once and appends evidence', async () => {
  const sql = fakeSql((text) => text.includes('complete_verification') ? [{
    email: 'author@example.com', terms_version: '1.0', session_expires_at: '2026-11-21T18:00:00Z', acceptance_created: true
  }] : []);
  const store = createCommunityStore({ sql, now: () => now });
  const result = await store.completeVerification({
    challengeId: 'challenge_1', sessionDigest: 'session-digest', requestFingerprint: 'fingerprint',
    userAgentHash: 'agent', locale: 'en-US', sessionExpiresAt: new Date('2026-11-21T18:00:00Z')
  });
  assert.equal(result.email, 'author@example.com');
  const statement = sql.calls.at(-1).text;
  assert.match(statement, /WITH consumed AS[\s\S]*UPDATE italus_community\.email_challenges/i);
  assert.match(statement, /INSERT INTO italus_community\.terms_acceptances/i);
  assert.match(statement, /ON CONFLICT \(email, terms_version\) DO NOTHING/i);
  assert.match(statement, /INSERT INTO italus_community\.browser_sessions/i);
  assert.match(statement, /INSERT INTO italus_community\.access_events/i);
});

test('trusted session lookup requires current terms, unexpired session, and active access', async () => {
  const sql = fakeSql((text) => text.includes('find_session') ? [{
    email: 'author@example.com', terms_version: '1.0', expires_at: '2026-11-21T18:00:00Z', status: 'active'
  }] : []);
  const store = createCommunityStore({ sql, now: () => now });
  const session = await store.findTrustedSession('session-digest', '1.0');
  assert.equal(session.status, 'active');
  assert.match(sql.calls.at(-1).text, /expires_at > \$3/i);
  assert.match(sql.calls.at(-1).text, /COALESCE\(s\.status, 'active'\) = 'active'/i);
});

test('cleanup preserves acceptance evidence while applying each operational retention boundary', async () => {
  const sql = fakeSql((text) => text.includes('community_cleanup') ? [{ challenges_deleted: 2, sessions_deleted: 1, events_deleted: 3 }] : []);
  const store = createCommunityStore({ sql, now: () => now });
  const result = await store.cleanup();
  assert.deepEqual(result, { challengesDeleted: 2, sessionsDeleted: 1, eventsDeleted: 3 });
  const statement = sql.calls.at(-1).text;
  assert.doesNotMatch(statement, /DELETE FROM italus_community\.terms_acceptances/i);
  assert.match(statement, /INTERVAL '24 hours'/i);
  assert.match(statement, /INTERVAL '30 days'/i);
  assert.match(statement, /INTERVAL '12 months'/i);
});
