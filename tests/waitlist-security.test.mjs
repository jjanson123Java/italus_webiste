import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRequestKey,
  escapeCsvCell,
  escapeHtml,
  isAuthorizedBasicAuth,
  normalizeEmail,
  validateWaitlistPayload
} from '../lib/waitlist-security.mjs';

test('normalizes email to trimmed lowercase', () => {
  assert.equal(normalizeEmail(' Author@Example.COM '), 'author@example.com');
});

test('accepts a valid unchecked waitlist payload', () => {
  const result = validateWaitlistPayload({
    name: '  Ada Author  ',
    email: ' ADA@EXAMPLE.COM ',
    genre: 'Fantasy',
    source: 'updates',
    marketingOptIn: false,
    website: '  '
  });

  assert.deepEqual(result, {
    ok: true,
    data: {
      name: 'Ada Author',
      email: 'ada@example.com',
      genre: 'Fantasy',
      source: 'updates',
      marketingOptIn: false,
      website: ''
    }
  });
});

test('accepts checked consent and an empty optional genre', () => {
  const result = validateWaitlistPayload({
    name: 'Octavia',
    email: 'octavia@example.com',
    genre: '',
    source: 'home',
    marketingOptIn: true,
    website: ''
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.genre, null);
  assert.equal(result.data.marketingOptIn, true);
});

for (const [label, payload] of [
  ['invalid email', { name: 'A', email: 'invalid', source: 'home', marketingOptIn: false }],
  ['overlong name', { name: 'a'.repeat(121), email: 'a@example.com', source: 'home', marketingOptIn: false }],
  ['unknown source', { name: 'A', email: 'a@example.com', source: 'footer', marketingOptIn: false }],
  ['unknown genre', { name: 'A', email: 'a@example.com', genre: 'Malware', source: 'updates', marketingOptIn: false }],
  ['non-boolean consent', { name: 'A', email: 'a@example.com', source: 'home', marketingOptIn: 'true' }]
]) {
  test(`rejects ${label}`, () => {
    const result = validateWaitlistPayload(payload);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0);
  });
}

test('creates deterministic opaque request keys', () => {
  const first = createRequestKey('203.0.113.8', 'test-secret');
  const second = createRequestKey('203.0.113.8', 'test-secret');
  assert.equal(first, second);
  assert.equal(first.includes('203.0.113.8'), false);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('accepts only valid Basic Authentication credentials', () => {
  const valid = `Basic ${Buffer.from('admin:correct horse').toString('base64')}`;
  const wrong = `Basic ${Buffer.from('admin:wrong').toString('base64')}`;
  const unequal = `Basic ${Buffer.from('administrator:correct horse').toString('base64')}`;

  assert.equal(isAuthorizedBasicAuth(valid, 'admin', 'correct horse'), true);
  assert.equal(isAuthorizedBasicAuth(undefined, 'admin', 'correct horse'), false);
  assert.equal(isAuthorizedBasicAuth('Bearer token', 'admin', 'correct horse'), false);
  assert.equal(isAuthorizedBasicAuth('Basic not-base64!', 'admin', 'correct horse'), false);
  assert.equal(isAuthorizedBasicAuth(wrong, 'admin', 'correct horse'), false);
  assert.equal(isAuthorizedBasicAuth(unequal, 'admin', 'correct horse'), false);
});

test('escapes untrusted HTML', () => {
  assert.equal(
    escapeHtml(`<script>alert('x') & "y"</script>`),
    '&lt;script&gt;alert(&#39;x&#39;) &amp; &quot;y&quot;&lt;/script&gt;'
  );
});

test('neutralizes spreadsheet formulas and quotes CSV cells', () => {
  for (const value of ['=cmd()', '+1+1', '-2+3', '@SUM(A1)']) {
    assert.equal(escapeCsvCell(value).startsWith("\"'"), true);
  }
  assert.equal(escapeCsvCell('author, writer'), '"author, writer"');
  assert.equal(escapeCsvCell('A "quote"'), '"A ""quote"""');
});
