import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMigrationStatements,
  getRuntimeRoleFromUrl,
  runMigration
} from '../scripts/migrate-waitlist.mjs';

test('extracts and safely quotes the runtime role from DATABASE_URL', () => {
  assert.equal(getRuntimeRoleFromUrl('postgresql://italus_runtime:secret@example.com/db'), 'italus_runtime');
  assert.throws(() => getRuntimeRoleFromUrl('postgresql://bad%22role:secret@example.com/db'), /runtime role/i);
});

test('migration is idempotent and creates only the dedicated waitlist schema objects', () => {
  const sql = buildMigrationStatements('italus_runtime').join('\n');
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS italus_waitlist/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS italus_waitlist\.waitlist_entries/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS italus_waitlist\.waitlist_rate_limits/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS/i);
  assert.doesNotMatch(sql, /DROP\s+(?:TABLE|SCHEMA|ROLE|DATABASE)/i);
});

test('migration revokes broad and default privileges before narrow grants', () => {
  const sql = buildMigrationStatements('italus_runtime').join('\n');
  assert.match(sql, /REVOKE ALL ON SCHEMA public FROM "italus_runtime"/i);
  assert.match(sql, /REVOKE ALL ON SCHEMA italus_waitlist FROM PUBLIC/i);
  assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA italus_waitlist FROM PUBLIC/i);
  assert.match(sql, /ALTER DEFAULT PRIVILEGES IN SCHEMA italus_waitlist REVOKE ALL ON TABLES FROM PUBLIC/i);
  assert.match(sql, /ALTER DEFAULT PRIVILEGES IN SCHEMA italus_waitlist REVOKE ALL ON SEQUENCES FROM PUBLIC/i);
  assert.match(sql, /GRANT USAGE ON SCHEMA italus_waitlist TO "italus_runtime"/i);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE italus_waitlist\.waitlist_entries, italus_waitlist\.waitlist_rate_limits TO "italus_runtime"/i);
  assert.match(sql, /GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA italus_waitlist TO "italus_runtime"/i);
  assert.doesNotMatch(sql, /GRANT\s+(?:CREATE|ALL).*TO "italus_runtime"/i);
});

test('runs every migration statement using the administrative connection', async () => {
  const calls = [];
  const sql = { async query(statement) { calls.push(statement); } };
  await runMigration({ sql, runtimeDatabaseUrl: 'postgresql://italus_runtime:secret@example.com/db' });
  assert.deepEqual(calls, buildMigrationStatements('italus_runtime'));
});
