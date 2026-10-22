import { neon } from '@neondatabase/serverless';

let productionSql;

function getProductionSql() {
  if (!productionSql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
    productionSql = neon(process.env.DATABASE_URL);
  }
  return productionSql;
}

async function rows(sql, text, params = []) {
  const result = await sql.query(text, params);
  return Array.isArray(result) ? result : result.rows;
}

function asDate(value) {
  return value == null || value instanceof Date ? value : new Date(value);
}

function mapChallenge(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    codeDigest: row.code_digest,
    termsVersion: row.terms_version,
    documentSha256: row.document_sha256,
    channel: row.destination_channel,
    expiresAt: asDate(row.expires_at),
    resendAfter: asDate(row.resend_after),
    failedAttempts: Number(row.failed_attempts ?? 0),
    consumedAt: asDate(row.consumed_at),
    requestFingerprint: row.request_fingerprint
  };
}

export function createCommunityStore({ sql = getProductionSql(), now = () => new Date() } = {}) {
  return {
    async checkRateLimit(requestKey, action, limit, windowMinutes) {
      const current = now();
      const cutoff = new Date(current.getTime() - windowMinutes * 60_000);
      const result = await rows(sql, `/* community_rate_limit */
        WITH locked AS (
          SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))
        ), recent AS (
          SELECT COUNT(*)::int AS total FROM italus_community.rate_limits
          CROSS JOIN locked
          WHERE request_key = $1 AND action = $2 AND attempted_at >= $3
        ), inserted AS (
          INSERT INTO italus_community.rate_limits (request_key, action, attempted_at)
          SELECT $1, $2, $5 FROM recent WHERE total < $4
          RETURNING 1
        )
        SELECT EXISTS(SELECT 1 FROM inserted) AS allowed`, [requestKey, action, cutoff, limit, current]);
      return result[0]?.allowed === true;
    },

    async replaceChallenge(data) {
      const result = await rows(sql, `/* replace_challenge */
        WITH locked AS (
          SELECT pg_advisory_xact_lock(hashtextextended($2, 0))
        ), eligible AS (
          SELECT 1 FROM locked
          WHERE NOT EXISTS (
            SELECT 1 FROM italus_community.email_challenges
            WHERE email = $2 AND consumed_at IS NULL AND resend_after > $9
          )
        ), invalidated AS (
          UPDATE italus_community.email_challenges
          SET consumed_at = $9
          FROM eligible
          WHERE email = $2 AND consumed_at IS NULL AND resend_after <= $9
          RETURNING id
        )
        INSERT INTO italus_community.email_challenges (
          id, email, code_digest, terms_version, document_sha256, destination_channel,
          expires_at, resend_after, request_fingerprint, created_at
        ) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$10,$9 FROM eligible
        RETURNING *`, [data.id, data.email, data.codeDigest, data.termsVersion, data.documentSha256,
        data.channel, data.expiresAt, data.resendAfter, now(), data.requestFingerprint]);
      return mapChallenge(result[0]);
    },

    async findChallenge(id) {
      const result = await rows(sql, `/* find_challenge */ SELECT * FROM italus_community.email_challenges WHERE id = $1`, [id]);
      return mapChallenge(result[0]);
    },

    async recordFailedAttempt(id) {
      const result = await rows(sql, `/* failed_challenge_attempt */
        UPDATE italus_community.email_challenges
        SET failed_attempts = LEAST(failed_attempts + 1, 5)
        WHERE id = $1 AND consumed_at IS NULL AND expires_at > $2
        RETURNING *`, [id, now()]);
      return mapChallenge(result[0]);
    },

    async completeVerification(data) {
      const current = now();
      const result = await rows(sql, `/* complete_verification */
        WITH consumed AS (
          UPDATE italus_community.email_challenges c
          SET consumed_at = $2
          FROM italus_community.terms_versions t
          WHERE c.id = $1 AND c.consumed_at IS NULL AND c.expires_at > $2 AND c.failed_attempts < 5
            AND t.version = c.terms_version AND t.document_sha256 = c.document_sha256 AND t.is_current
            AND COALESCE((SELECT s.status FROM italus_community.access_status s WHERE s.email = c.email
              AND (s.expires_at IS NULL OR s.expires_at > $2)), 'active') = 'active'
          RETURNING c.*
        ), accepted AS (
          INSERT INTO italus_community.terms_acceptances (
            email, terms_version, document_sha256, accepted_at, email_verified_at,
            acceptance_method, destination_channel, request_fingerprint, user_agent_hash, locale
          ) SELECT email, terms_version, document_sha256, $2, $2, 'email_otp', destination_channel,
            $4, $5, $6 FROM consumed
          ON CONFLICT (email, terms_version) DO NOTHING
          RETURNING id
        ), session_insert AS (
          INSERT INTO italus_community.browser_sessions (
            token_digest, email, terms_version, created_at, last_verified_at, expires_at
          ) SELECT $3, email, terms_version, $2, $2, $7 FROM consumed
          RETURNING email, terms_version, expires_at
        ), event_insert AS (
          INSERT INTO italus_community.access_events (
            event_type, email, terms_version, destination_channel, occurred_at, request_fingerprint, user_agent_hash
          ) SELECT CASE WHEN EXISTS(SELECT 1 FROM accepted) THEN 'accepted' ELSE 'reverified' END,
            email, terms_version, destination_channel, $2, $4, $5 FROM consumed
          RETURNING id
        )
        SELECT s.email, s.terms_version, s.expires_at AS session_expires_at,
          EXISTS(SELECT 1 FROM accepted) AS acceptance_created
        FROM session_insert s`, [data.challengeId, current, data.sessionDigest, data.requestFingerprint,
        data.userAgentHash, data.locale, data.sessionExpiresAt]);
      const row = result[0];
      return row ? {
        email: row.email,
        termsVersion: row.terms_version,
        sessionExpiresAt: asDate(row.session_expires_at),
        acceptanceCreated: row.acceptance_created === true
      } : null;
    },

    async findTrustedSession(tokenDigest, termsVersion) {
      const current = now();
      const result = await rows(sql, `/* find_session */
        SELECT b.email, b.terms_version, b.expires_at,
          COALESCE(s.status, 'active') AS status
        FROM italus_community.browser_sessions b
        JOIN italus_community.terms_versions t ON t.version = b.terms_version AND t.is_current
        LEFT JOIN italus_community.access_status s ON s.email = b.email
          AND (s.expires_at IS NULL OR s.expires_at > $3)
        WHERE b.token_digest = $1 AND b.terms_version = $2 AND b.expires_at > $3
          AND b.revoked_at IS NULL AND COALESCE(s.status, 'active') = 'active'`, [tokenDigest, termsVersion, current]);
      const row = result[0];
      return row ? { email: row.email, termsVersion: row.terms_version, expiresAt: asDate(row.expires_at), status: row.status } : null;
    },

    async recordAccess({ eventType, email, termsVersion, channel, requestFingerprint, userAgentHash }) {
      await rows(sql, `/* record_access */ INSERT INTO italus_community.access_events
        (event_type, email, terms_version, destination_channel, occurred_at, request_fingerprint, user_agent_hash)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [eventType, email, termsVersion, channel, now(), requestFingerprint, userAgentHash]);
    },

    async revokeSession(tokenDigest) {
      const result = await rows(sql, `/* revoke_session */ UPDATE italus_community.browser_sessions
        SET revoked_at = $2 WHERE token_digest = $1 AND revoked_at IS NULL RETURNING email, terms_version`, [tokenDigest, now()]);
      return result[0] ?? null;
    },

    async cleanup() {
      const result = await rows(sql, `/* community_cleanup */
        WITH challenges AS (
          DELETE FROM italus_community.email_challenges
          WHERE (expires_at < $1 OR consumed_at IS NOT NULL) AND created_at < $1 - INTERVAL '24 hours'
          RETURNING 1
        ), sessions AS (
          DELETE FROM italus_community.browser_sessions
          WHERE (expires_at < $1 - INTERVAL '30 days') OR (revoked_at IS NOT NULL AND revoked_at < $1 - INTERVAL '30 days')
          RETURNING 1
        ), events AS (
          DELETE FROM italus_community.access_events WHERE occurred_at < $1 - INTERVAL '12 months' RETURNING 1
        ), limits AS (
          DELETE FROM italus_community.rate_limits WHERE attempted_at < $1 - INTERVAL '24 hours' RETURNING 1
        )
        SELECT (SELECT COUNT(*)::int FROM challenges) AS challenges_deleted,
          (SELECT COUNT(*)::int FROM sessions) AS sessions_deleted,
          (SELECT COUNT(*)::int FROM events) AS events_deleted`, [now()]);
      const row = result[0] ?? {};
      return {
        challengesDeleted: Number(row.challenges_deleted ?? 0),
        sessionsDeleted: Number(row.sessions_deleted ?? 0),
        eventsDeleted: Number(row.events_deleted ?? 0)
      };
    },

    async listEvidence() {
      const result = await rows(sql, `/* list_community_evidence */
        SELECT a.email, COALESCE(s.status, 'active') AS status, a.terms_version,
          a.accepted_at, e.event_type AS latest_event, e.occurred_at AS latest_event_at
        FROM italus_community.terms_acceptances a
        LEFT JOIN italus_community.access_status s ON s.email = a.email
        LEFT JOIN LATERAL (
          SELECT event_type, occurred_at FROM italus_community.access_events
          WHERE email = a.email ORDER BY occurred_at DESC LIMIT 1
        ) e ON TRUE ORDER BY a.accepted_at DESC`);
      return result.map((row) => ({
        email: row.email, status: row.status, termsVersion: row.terms_version,
        acceptedAt: asDate(row.accepted_at), latestEvent: row.latest_event,
        latestEventAt: asDate(row.latest_event_at)
      }));
    }
  };
}
