import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCommunityMigrationStatements,
  getRuntimeRoleFromUrl,
  runCommunityMigration
} from '../scripts/migrate-community.mjs';

const terms = {
  version: '1.0',
  effectiveDate: 'October 22, 2026',
  documentSha256: 'a'.repeat(64)
};

test('community migration creates versioned evidence and operational tables idempotently', () => {
  const sql = buildCommunityMigrationStatements('italus_runtime', terms).join('\n');
  for (const table of ['terms_versions', 'terms_acceptances', 'email_challenges', 'browser_sessions', 'access_status', 'access_events', 'rate_limits']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS italus_community\\.${table}`, 'i'));
  }
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS terms_versions_one_current/i);
  assert.match(sql, /INSERT INTO italus_community\.terms_versions/i);
  assert.match(sql, /ON CONFLICT \(version\) DO NOTHING/i);
  assert.match(sql, /RAISE EXCEPTION[\s\S]*hash/i);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS community_one_active_challenge/i);
  assert.match(sql, new RegExp(terms.documentSha256));
});

test('community migration grants append-only acceptance access and mutable operational access', () => {
  const sql = buildCommunityMigrationStatements('italus_runtime', terms).join('\n');
  assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA italus_community FROM "italus_runtime"/i);
  assert.match(sql, /GRANT SELECT, INSERT ON TABLE italus_community\.terms_acceptances TO "italus_runtime"/i);
  assert.doesNotMatch(sql, /GRANT[^;\n]*UPDATE[^;\n]*terms_acceptances/i);
  assert.doesNotMatch(sql, /GRANT[^;\n]*DELETE[^;\n]*terms_acceptances/i);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE[\s\S]*email_challenges[\s\S]*browser_sessions[\s\S]*rate_limits TO "italus_runtime"/i);
});

test('community migration validates and safely quotes the runtime database role', () => {
  assert.equal(getRuntimeRoleFromUrl('postgresql://italus_runtime:secret@example.com/neondb'), 'italus_runtime');
  assert.throws(() => getRuntimeRoleFromUrl('not a url'), /valid Postgres/i);
  assert.throws(() => buildCommunityMigrationStatements('bad-role!', terms), /invalid runtime role/i);
});

test('community migration runs every statement using the administrative connection', async () => {
  const calls = [];
  const sql = { async query(statement) { calls.push(statement); } };
  await runCommunityMigration({
    sql,
    runtimeDatabaseUrl: 'postgresql://italus_runtime:secret@example.com/neondb',
    terms
  });
  assert.deepEqual(calls, buildCommunityMigrationStatements('italus_runtime', terms));
});
