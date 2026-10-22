import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { COMMUNITY_TERMS } from '../js/community-terms.generated.mjs';

export function getRuntimeRoleFromUrl(databaseUrl) {
  let username;
  try {
    username = new URL(databaseUrl).username;
  } catch {
    throw new Error('DATABASE_URL must be a valid Postgres connection URL.');
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(username)) throw new Error('The runtime role in DATABASE_URL is invalid.');
  return username;
}

function validateTerms(terms) {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(terms?.version ?? '')) throw new Error('Invalid community terms version.');
  if (!/^[a-f0-9]{64}$/.test(terms?.documentSha256 ?? '')) throw new Error('Invalid community terms hash.');
  const effective = new Date(terms?.effectiveDate ?? '');
  if (Number.isNaN(effective.getTime())) throw new Error('Invalid community terms effective date.');
  return effective.toISOString();
}

export function buildCommunityMigrationStatements(runtimeRole, terms = COMMUNITY_TERMS) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(runtimeRole)) throw new Error('Invalid runtime role.');
  const effective = validateTerms(terms);
  const role = `"${runtimeRole}"`;
  return [
    'CREATE SCHEMA IF NOT EXISTS italus_community',
    `CREATE TABLE IF NOT EXISTS italus_community.terms_versions (
      version TEXT PRIMARY KEY,
      effective_at TIMESTAMPTZ NOT NULL,
      document_sha256 TEXT NOT NULL CHECK (document_sha256 ~ '^[a-f0-9]{64}$'),
      document_path TEXT NOT NULL,
      is_current BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS terms_versions_one_current
      ON italus_community.terms_versions (is_current) WHERE is_current`,
    `CREATE TABLE IF NOT EXISTS italus_community.terms_acceptances (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      terms_version TEXT NOT NULL REFERENCES italus_community.terms_versions(version),
      document_sha256 TEXT NOT NULL,
      accepted_at TIMESTAMPTZ NOT NULL,
      email_verified_at TIMESTAMPTZ NOT NULL,
      acceptance_method TEXT NOT NULL CHECK (acceptance_method = 'email_otp'),
      destination_channel TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      user_agent_hash TEXT,
      locale TEXT,
      supersedes_acceptance_id BIGINT REFERENCES italus_community.terms_acceptances(id),
      UNIQUE (email, terms_version)
    )`,
    `CREATE TABLE IF NOT EXISTS italus_community.email_challenges (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code_digest TEXT NOT NULL,
      terms_version TEXT NOT NULL REFERENCES italus_community.terms_versions(version),
      document_sha256 TEXT NOT NULL,
      destination_channel TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      resend_after TIMESTAMPTZ NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
      consumed_at TIMESTAMPTZ,
      request_fingerprint TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS italus_community.browser_sessions (
      token_digest TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      terms_version TEXT NOT NULL REFERENCES italus_community.terms_versions(version),
      created_at TIMESTAMPTZ NOT NULL,
      last_verified_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ
    )`,
    `CREATE TABLE IF NOT EXISTS italus_community.access_status (
      email TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'blocked')),
      reason TEXT,
      changed_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ
    )`,
    `CREATE TABLE IF NOT EXISTS italus_community.access_events (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL CHECK (event_type IN ('accepted', 'reverified', 'trusted_access', 'denied', 'logout')),
      email TEXT NOT NULL,
      terms_version TEXT NOT NULL,
      destination_channel TEXT,
      occurred_at TIMESTAMPTZ NOT NULL,
      request_fingerprint TEXT,
      user_agent_hash TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS italus_community.rate_limits (
      id BIGSERIAL PRIMARY KEY,
      request_key TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('otp_start_email', 'otp_start_ip', 'otp_verify_ip', 'trusted_access_ip')),
      attempted_at TIMESTAMPTZ NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS community_challenges_email_idx ON italus_community.email_challenges (email, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS community_sessions_email_idx ON italus_community.browser_sessions (email, expires_at DESC)',
    'CREATE INDEX IF NOT EXISTS community_events_email_idx ON italus_community.access_events (email, occurred_at DESC)',
    'CREATE INDEX IF NOT EXISTS community_rate_limits_lookup_idx ON italus_community.rate_limits (request_key, action, attempted_at DESC)',
    `UPDATE italus_community.terms_versions SET is_current = FALSE WHERE is_current AND version <> '${terms.version}'`,
    `INSERT INTO italus_community.terms_versions (version, effective_at, document_sha256, document_path, is_current)
      VALUES ('${terms.version}', '${effective}', '${terms.documentSha256}', 'docs/community-gateway-disclosure.md', TRUE)
      ON CONFLICT (version) DO UPDATE SET effective_at = EXCLUDED.effective_at,
        document_sha256 = EXCLUDED.document_sha256, document_path = EXCLUDED.document_path, is_current = TRUE`,
    'REVOKE ALL ON SCHEMA italus_community FROM PUBLIC',
    'REVOKE ALL ON ALL TABLES IN SCHEMA italus_community FROM PUBLIC',
    'REVOKE ALL ON ALL SEQUENCES IN SCHEMA italus_community FROM PUBLIC',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA italus_community REVOKE ALL ON TABLES FROM PUBLIC',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA italus_community REVOKE ALL ON SEQUENCES FROM PUBLIC',
    `REVOKE ALL ON SCHEMA italus_community FROM ${role}`,
    `REVOKE ALL ON ALL TABLES IN SCHEMA italus_community FROM ${role}`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA italus_community FROM ${role}`,
    `GRANT USAGE ON SCHEMA italus_community TO ${role}`,
    `GRANT SELECT ON TABLE italus_community.terms_versions, italus_community.access_status TO ${role}`,
    `GRANT SELECT, INSERT ON TABLE italus_community.terms_acceptances TO ${role}`,
    `GRANT SELECT, INSERT ON TABLE italus_community.access_events TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      italus_community.email_challenges,
      italus_community.browser_sessions,
      italus_community.rate_limits TO ${role}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA italus_community TO ${role}`
  ];
}

export async function runCommunityMigration({ sql, runtimeDatabaseUrl, terms = COMMUNITY_TERMS }) {
  const statements = buildCommunityMigrationStatements(getRuntimeRoleFromUrl(runtimeDatabaseUrl), terms);
  for (const statement of statements) await sql.query(statement);
}

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  const runtimeUrl = process.env.DATABASE_URL;
  if (!adminUrl || !runtimeUrl) throw new Error('DATABASE_ADMIN_URL and DATABASE_URL are required.');
  if (adminUrl === runtimeUrl) throw new Error('Administrative and runtime database connections must be different.');
  await runCommunityMigration({ sql: neon(adminUrl), runtimeDatabaseUrl: runtimeUrl });
  process.stdout.write(`Community migration completed for terms ${COMMUNITY_TERMS.version}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Community migration failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
