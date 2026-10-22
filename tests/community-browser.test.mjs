import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startCommunityVerification, verifyCommunityCode, requestTrustedCommunityAccess } from '../js/community-gateway.mjs';

const root = new URL('../', import.meta.url);
test('community page gates all five internal slugs and embeds the complete versioned disclosure', async () => {
  const html = await readFile(new URL('community.html', root), 'utf8');
  assert.doesNotMatch(html, /href="https:\/\/writers-block\.beehiiv\.com\/community/);
  for (const slug of ['community', 'writers-room', 'italus-bookshelf', 'manuscript-lab', 'worlds-characters']) assert.match(html, new RegExp(`data-community-channel="${slug}"`));
  assert.match(html, /data-community-dialog/);
  assert.match(html, /data-community-terms/);
  assert.match(html, /data-community-acceptance-text/);
  assert.match(html, /disabled[^>]*>Agree and continue/);
  assert.match(html, /I confirm that I am at least 18 years old/);
  assert.match(html, /js\/community-gateway\.mjs/);
  const script = await readFile(new URL('js/community-gateway.mjs', root), 'utf8');
  assert.match(script, /COMMUNITY_TERMS\.acceptanceText/);
});

test('browser client calls only same-origin gateway endpoints', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => { requests.push({ url, options }); return new Response(JSON.stringify({ ok: true, challengeId: 'c1', destination: 'https://writers-block.beehiiv.com/community' }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  await startCommunityVerification({ email: 'a@b.com', channel: 'community' }, fetchImpl);
  await verifyCommunityCode({ challengeId: 'c1', code: '123456', accepted: true, ageConfirmed: true }, fetchImpl);
  await requestTrustedCommunityAccess('community', fetchImpl);
  assert.deepEqual(requests.map((x) => x.url), ['/api/community-access-start', '/api/community-access-verify', '/api/community-access']);
  for (const request of requests) assert.equal(request.options.credentials, 'same-origin');
});

test('privacy notice documents community verification separately from marketing', async () => {
  const html = await readFile(new URL('privacy.html', root), 'utf8');
  assert.match(html, /Community verification/i);
  assert.match(html, /does not enroll you in marketing/i);
  assert.match(html, /Resend/);
  assert.match(html, /Neon/);
  assert.match(html, /30 days/);
  assert.match(html, /at least six years/i);
  const disclosure = await readFile(new URL('docs/community-gateway-disclosure.md', root), 'utf8');
  assert.match(disclosure, /at least six years/i);
});
