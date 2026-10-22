import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
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
  'studio.html',
  'community.html'
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
    assert.match(html, /href="community\.html"/);
  });
}

test('community gateway routes every card through its internal verified channel slug', async () => {
  const html = await readFile(join(root, 'community.html'), 'utf8');
  const destinations = ['writers-room', 'italus-bookshelf', 'manuscript-lab', 'worlds-characters'];

  for (const destination of destinations) {
    assert.match(html, new RegExp(`data-community-channel="${destination}"`));
  }
  assert.doesNotMatch(html, /href="https:\/\/writers-block\.beehiiv\.com\/community/);
});

test('community is ordered between Pricing and Social in every primary navigation', async () => {
  for (const page of pages) {
    const html = await readFile(join(root, page), 'utf8');
    assert.match(html, /<a[^>]*href="pricing\.html"[^>]*>Pricing<\/a><\/li><li><a[^>]*href="community\.html"[^>]*>Community<\/a><\/li><li><a[^>]*href="updates\.html#social"[^>]*>Social<\/a>/);
  }
});

test('every primary navigation contains a non-operable launch registration placeholder', async () => {
  const script = await readFile(join(root, 'js', 'site.mjs'), 'utf8');
  assert.match(script, /data-registration-placeholder/);
  assert.match(script, /Sign Up — Coming at launch/);
  assert.match(script, /button\.disabled = true/);
  for (const page of pages) {
    const html = await readFile(join(root, page), 'utf8');
    assert.match(html, /<script type="module" src="js\/site\.mjs"><\/script>/);
  }
});

test('the reviewed registration disclosure separates access, community, marketing, and future payment consent', async () => {
  const markdown = await readFile(join(root, 'docs', 'italus-registration-and-legal-disclosures.md'), 'utf8');
  assert.match(markdown, /Version:\*\* 1\.0/);
  assert.match(markdown, /Registration does not enroll you in marketing/i);
  assert.match(markdown, /Registration does not grant community access/i);
  assert.match(markdown, /no automatic conversion to a paid plan/i);
  assert.match(markdown, /Free Trial, Author, and Studio plans/);
  assert.match(markdown, /tokens are not the same as words/i);
  assert.match(markdown, /OpenAI|Anthropic/);
});

test('every footer provides a Community entry point', async () => {
  for (const page of pages) {
    const html = await readFile(join(root, page), 'utf8');
    assert.match(html, /<footer[\s\S]*href="community\.html"[\s\S]*<\/footer>/);
  }
});

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
  assert.match(html, /<nav[^>]+aria-label="Primary"[\s\S]*href="community\.html"[\s\S]*<\/nav>/);
  assert.match(html, /<footer[\s\S]*href="community\.html"[\s\S]*<\/footer>/);
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

test('science-fiction cards use the approved Italus studio artwork everywhere', async () => {
  const approvedImage = 'assets/themes/sci-fi/studio-bg-separated.png';
  await access(join(root, approvedImage));

  for (const page of ['index.html', 'themes.html']) {
    const html = await readFile(join(root, page), 'utf8');
    assert.match(html, new RegExp(approvedImage.replaceAll('/', '\\/').replace('.', '\\.')));
    assert.doesNotMatch(html, /assets\/themes\/sci-fi\/thumbnail\.jpg/);
  }
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


test('social page presents six accessible channels including TikTok and matching content', async () => {
  const html = await readFile(join(root, 'updates.html'), 'utf8');
  const css = await readFile(join(root, 'styles.css'), 'utf8');
  assert.equal((html.match(/class="social-link"/g) || []).length, 6);
  assert.match(html, /<a class="social-link" href="#tiktok" aria-label="Italus TikTok channel placeholder">/);
  assert.match(html, /<span>TikTok<\/span><\/a>/);
  assert.match(html, /<article class="card" id="tiktok"><h3>Short-form studio demos<\/h3>/);
  assert.match(html, /Planned TikTok clips will spotlight canon controls/);
  assert.doesNotMatch(html, /href="https:\/\/[^"]*tiktok\.com/i);
  assert.match(css, /\.social-grid \{[^}]*grid-template-columns: repeat\(3, 1fr\)/);
});
