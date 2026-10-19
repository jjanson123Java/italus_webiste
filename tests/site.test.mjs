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

test('preview forms disclose that delivery is not live', () => {
  assert.match(getFormConfirmation('waitlist'), /preview/i);
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
