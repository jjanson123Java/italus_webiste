import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildCommunityTermsArtifact,
  generateCommunityTerms,
  normalizeTermsMarkdown
} from '../scripts/generate-community-terms.mjs';

const SAMPLE_CRLF = '# Sample\r\n\r\n**Version:** 1.0  \r\n**Effective date:** October 22, 2026\r\n\r\n## Acceptance Presented in the Gateway\r\n\r\n> I agree.\r\n\r\n[Policy](https://example.com)';

test('normalizes line endings before hashing and extracts reviewed metadata', () => {
  const normalized = normalizeTermsMarkdown(SAMPLE_CRLF);
  const artifact = buildCommunityTermsArtifact(SAMPLE_CRLF);

  assert.doesNotMatch(normalized, /\r/);
  assert.equal(artifact.version, '1.0');
  assert.equal(artifact.effectiveDate, 'October 22, 2026');
  assert.equal(artifact.documentSha256, 'a284729291fddf84fbd84e93e45ec96bc5489a432f0126a61538069e519f67b9');
  assert.equal(artifact.acceptanceText, 'I agree.');
});

test('renders trusted disclosure links safely for a new browsing context', () => {
  const artifact = buildCommunityTermsArtifact(SAMPLE_CRLF);

  assert.match(artifact.html, /<h1>Sample<\/h1>/);
  assert.match(artifact.html, /href="https:\/\/example\.com"/);
  assert.match(artifact.html, /target="_blank"/);
  assert.match(artifact.html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(artifact.html, /<script/i);
});

test('check mode detects a generated module that no longer matches the markdown', async () => {
  const root = await mkdtemp(join(tmpdir(), 'italus-terms-'));
  const sourcePath = join(root, 'terms.md');
  const outputPath = join(root, 'terms.generated.mjs');
  await writeFile(sourcePath, SAMPLE_CRLF, 'utf8');

  const written = await generateCommunityTerms({ sourcePath, outputPath });
  assert.equal(written.current, true);
  const original = await readFile(outputPath, 'utf8');

  await writeFile(sourcePath, `${SAMPLE_CRLF}\r\n\r\nChanged.`, 'utf8');
  const checked = await generateCommunityTerms({ sourcePath, outputPath, check: true });
  assert.equal(checked.current, false);
  assert.equal(await readFile(outputPath, 'utf8'), original);
});
