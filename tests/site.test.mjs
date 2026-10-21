import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isValidEmail, getFormConfirmation, getCopyrightYear } from '../js/site.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = [
  'index.html',
  'how-it-works.html',
  'features.html',
  'themes.html',
  'pricing.html',
  'about.html',
  'updates.html',
  'contact.html',
  'studio.html'
];

test('validates realistic email input', () => {
  assert.equal(isValidEmail('author@example.com'), true);
  assert.equal(isValidEmail(' author@example.com '), true);
  assert.equal(isValidEmail('author@'), false);
  assert.equal(isValidEmail(''), false);
});

for (const [page, source] of [['index.html', 'home'], ['updates.html', 'updates']]) {
  test(`${page} has a production waitlist form with optional email consent`, async () => {
    const html = await readFile(join(root, page), 'utf8');
    assert.match(html, /data-waitlist-form/);
    assert.match(html, new RegExp(`name="source" value="${source}"`));
    assert.match(html, /<select name="genre">/);
    assert.match(html, /<option>Fiction \/ general<\/option>/);
    assert.match(html, /<option>Fantasy<\/option>/);
    assert.match(html, /<option>Mystery \/ thriller<\/option>/);
    assert.match(html, /<option>Science fiction<\/option>/);
    assert.match(html, /<option>Romance<\/option>/);
    assert.match(html, /<option>Other<\/option>/);
    assert.match(html, /name="website"[^>]+tabindex="-1"/);
    assert.match(html, /type="checkbox" name="marketingOptIn"/);
    assert.doesNotMatch(html, /type="checkbox" name="marketingOptIn"[^>]+(?:required|checked)/);
    assert.match(html, /Email me Italus product releases, sales, and blog updates\. I understand I can unsubscribe at any time\./);
    assert.doesNotMatch(html, /Preview form—delivery will be connected before launch\./);
  });
}

test('non-waitlist preview forms retain their existing confirmation copy', () => {
  assert.match(getFormConfirmation('access'), /early access/i);
});

test('copyright year comes from the supplied date', () => {
  assert.equal(getCopyrightYear(new Date('2026-10-19T12:00:00Z')), 2026);
});

for (const page of pages) {
  test(`${page} has canonical metadata, navigation, and a main landmark`, async () => {
    const html = await readFile(join(root, page), 'utf8');
    assert.match(html, /<link rel="canonical" href="https:\/\/italusbooks\.com\//);
    assert.doesNotMatch(html, /italus\.book/);
    assert.match(html, /<meta property="og:title"/);
    assert.match(html, /<nav[^>]+aria-label="Primary"/);
    assert.match(html, /<main/);
    assert.match(html, /href="updates\.html#social"/);
  });
}

test('studio page labels the application as a future preview', async () => {
  const html = await readFile(join(root, 'studio.html'), 'utf8');
  assert.match(html, /Future application preview/i);
  assert.match(html, /not yet connected/i);
});

test('subscription confirmation page completes the newsletter journey without another form', async () => {
  const html = await readFile(join(root, 'subscription-confirmed.html'), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/italusbooks\.com\/subscription-confirmed\.html">/);
  assert.match(html, /<meta name="robots" content="noindex,follow">/);
  assert.match(html, /Subscription confirmed/i);
  assert.match(html, /subscribed to Writer(?:&rsquo;|&#8217;|’)s Block by Italus Studio/i);
  assert.match(html, /href="index\.html"[^>]*>Return to Italus Studio</i);
  assert.match(html, /href="updates\.html"[^>]*>Explore Italus updates</i);
  assert.doesNotMatch(html, /<form\b/i);
});

test('sitemap lists every public page on italusbooks.com', async () => {
  const xml = await readFile(join(root, 'sitemap.xml'), 'utf8');
  for (const page of pages) {
    const path = page === 'index.html' ? '' : page;
    assert.match(xml, new RegExp(`https://italusbooks\\.com/${path.replace('.', '\\.')}?`));
  }
  assert.doesNotMatch(xml, /italus\.book/);
});

test('critical hero content remains visible and uses the clean studio artwork', async () => {
  const css = await readFile(join(root, 'styles.css'), 'utf8');
  assert.match(css, /url\('assets\/themes\/original\/studio-bg\.png'\)/);
  assert.doesNotMatch(css, /\[data-reveal\]\s*\{[^}]*opacity:\s*0/s);
  assert.match(css, /\.hero\s*\{[^}]*display:\s*flex/s);
});

test('deployment configuration documents secure waitlist operations without secret values', async () => {
  const example = await readFile(join(root, '.env.example'), 'utf8');
  for (const name of [
    'DATABASE_URL', 'DATABASE_ADMIN_URL', 'WAITLIST_ADMIN_USERNAME',
    'WAITLIST_ADMIN_PASSWORD', 'WAITLIST_IP_HASH_SECRET',
    'BEEHIIV_API_KEY', 'BEEHIIV_PUBLICATION_ID'
  ]) {
    assert.match(example, new RegExp(`^${name}=$`, 'm'));
  }

  const ignore = await readFile(join(root, '.gitignore'), 'utf8');
  assert.match(ignore, /^\.env\.local$/m);
  assert.match(ignore, /^!\.env\.example$/m);

  const readme = await readFile(join(root, 'README.md'), 'utf8');
  for (const phrase of [
    /restricted runtime role/i, /DATABASE_ADMIN_URL/, /npm run migrate:waitlist/,
    /Beehiiv/i, /admin-waitlist/, /multi-factor authentication|MFA/i,
    /rotate.*password/i, /end-to-end verification/i, /Vercel Firewall/i
  ]) assert.match(readme, phrase);
});

test('administrator route is absent from public discovery and navigation', async () => {
  const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');
  assert.doesNotMatch(sitemap, /admin-waitlist/);
  for (const page of pages) {
    const html = await readFile(join(root, page), 'utf8');
    assert.doesNotMatch(html, /href=["'][^"']*admin-waitlist/);
  }
});
