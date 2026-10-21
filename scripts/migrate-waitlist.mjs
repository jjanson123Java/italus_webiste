import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';

export function getRuntimeRoleFromUrl(databaseUrl) {
  let username;
  try {
    username = new URL(databaseUrl).username;
  } catch {
    throw new Error('DATABASE_URL must be a valid Postgres connection URL.');
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(username)) {
    throw new Error('The runtime role in DATABASE_URL is invalid.');
  }
  return username;
}

export function buildMigrationStatements(runtimeRole) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(runtimeRole)) throw new Error('Invalid runtime role.');
  const role = `"${runtimeRole}"`;
  return [
    'CREATE SCHEMA IF NOT EXISTS italus_waitlist',
    `CREATE TABLE IF NOT EXISTS italus_waitlist.waitlist_entries (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      genre TEXT,
      source TEXT NOT NULL CHECK (source IN ('home', 'updates')),
      marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
      marketing_consent_at TIMESTAMPTZ,
      marketing_unsubscribed_at TIMESTAMPTZ,
      beehiiv_subscription_id TEXT,
      beehiiv_sync_status TEXT NOT NULL DEFAULT 'not_requested'
        CHECK (beehiiv_sync_status IN ('not_requested', 'pending', 'synced', 'failed', 'unsubscribed')),
      beehiiv_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS italus_waitlist.waitlist_rate_limits (
      id BIGSERIAL PRIMARY KEY,
      request_key TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('waitlist', 'admin_auth')),
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    'ALTER TABLE italus_waitlist.waitlist_entries ADD COLUMN IF NOT EXISTS marketing_unsubscribed_at TIMESTAMPTZ',
    'ALTER TABLE italus_waitlist.waitlist_entries DROP CONSTRAINT IF EXISTS waitlist_entries_beehiiv_sync_status_check',
    `ALTER TABLE italus_waitlist.waitlist_entries
      ADD CONSTRAINT waitlist_entries_beehiiv_sync_status_check
      CHECK (beehiiv_sync_status IN ('not_requested', 'pending', 'synced', 'failed', 'unsubscribed'))`,
    'CREATE INDEX IF NOT EXISTS waitlist_rate_limits_lookup_idx ON italus_waitlist.waitlist_rate_limits (request_key, action, attempted_at DESC)',
    'REVOKE ALL ON SCHEMA italus_waitlist FROM PUBLIC',
    'REVOKE ALL ON ALL TABLES IN SCHEMA italus_waitlist FROM PUBLIC',
    'REVOKE ALL ON ALL SEQUENCES IN SCHEMA italus_waitlist FROM PUBLIC',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA italus_waitlist REVOKE ALL ON TABLES FROM PUBLIC',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA italus_waitlist REVOKE ALL ON SEQUENCES FROM PUBLIC',
    'REVOKE CREATE ON SCHEMA public FROM PUBLIC',
    `REVOKE ALL ON SCHEMA public FROM ${role}`,
    "DO $migration$ BEGIN EXECUTE format('REVOKE TEMP ON DATABASE %I FROM PUBLIC', current_database()); END $migration$",
    `DO $migration$ BEGIN EXECUTE format('REVOKE CREATE, TEMP ON DATABASE %I FROM ${role}', current_database()); END $migration$`,
    `REVOKE ALL ON SCHEMA italus_waitlist FROM ${role}`,
    `REVOKE ALL ON ALL TABLES IN SCHEMA italus_waitlist FROM ${role}`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA italus_waitlist FROM ${role}`,
    `GRANT USAGE ON SCHEMA italus_waitlist TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE italus_waitlist.waitlist_entries, italus_waitlist.waitlist_rate_limits TO ${role}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA italus_waitlist TO ${role}`
  ];
}

export async function runMigration({ sql, runtimeDatabaseUrl }) {
  const role = getRuntimeRoleFromUrl(runtimeDatabaseUrl);
  const statements = buildMigrationStatements(role);
  for (const statement of statements) await sql.query(statement);
}

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  const runtimeUrl = process.env.DATABASE_URL;
  if (!adminUrl || !runtimeUrl) throw new Error('DATABASE_ADMIN_URL and DATABASE_URL are required.');
  if (adminUrl === runtimeUrl) throw new Error('Administrative and runtime database connections must be different.');
  await runMigration({ sql: neon(adminUrl), runtimeDatabaseUrl: runtimeUrl });
  process.stdout.write('Waitlist migration completed with restricted runtime grants.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Migration failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
