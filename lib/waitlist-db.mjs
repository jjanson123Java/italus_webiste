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
  if (value == null || value instanceof Date) return value;
  return new Date(value);
}

function mapEntry(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    email: row.email,
    name: row.name,
    genre: row.genre,
    source: row.source,
    marketingOptIn: row.marketing_opt_in,
    marketingConsentAt: asDate(row.marketing_consent_at),
    marketingUnsubscribedAt: asDate(row.marketing_unsubscribed_at),
    beehiivSubscriptionId: row.beehiiv_subscription_id,
    beehiivSyncStatus: row.beehiiv_sync_status,
    beehiivSyncedAt: asDate(row.beehiiv_synced_at),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at)
  };
}

export function createWaitlistStore({ sql = getProductionSql(), now = () => new Date() } = {}) {
  return {
    async checkRateLimit(requestKey, action = 'waitlist') {
      const current = now();
      const cutoff = new Date(current.getTime() - 15 * 60 * 1000);
      await rows(sql, `/* rate_limit_cleanup */
        DELETE FROM italus_waitlist.waitlist_rate_limits
        WHERE attempted_at < NOW() - INTERVAL '24 hours'`);
      const result = await rows(sql, `/* rate_limit */
        WITH recent AS (
          SELECT COUNT(*)::int AS total
          FROM italus_waitlist.waitlist_rate_limits
          WHERE request_key = $1 AND action = $2 AND attempted_at >= $3
        ), inserted AS (
          INSERT INTO italus_waitlist.waitlist_rate_limits (request_key, action, attempted_at)
          SELECT $1, $2, $4 FROM recent WHERE total < 5
          RETURNING 1
        )
        SELECT EXISTS(SELECT 1 FROM inserted) AS allowed`, [requestKey, action, cutoff, current]);
      return result[0]?.allowed === true;
    },

    async upsertEntry(data) {
      const current = now();
      const inserted = await rows(sql, `/* insert_entry */
        INSERT INTO italus_waitlist.waitlist_entries (
          email, name, genre, source, marketing_opt_in, marketing_consent_at,
          beehiiv_sync_status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5::boolean,
          CASE WHEN $5::boolean THEN $6::timestamptz ELSE NULL END,
          CASE WHEN $5::boolean THEN 'pending' ELSE 'not_requested' END,
          $6::timestamptz, $6::timestamptz)
        ON CONFLICT (email) DO NOTHING
        RETURNING *`, [data.email, data.name, data.genre, data.source, data.marketingOptIn, current]);

      if (inserted.length) {
        return {
          entry: mapEntry(inserted[0]),
          shouldSyncBeehiiv: data.marketingOptIn,
          reactivateExisting: false
        };
      }

      if (data.marketingOptIn) {
        const upgraded = await rows(sql, `/* upgrade_opt_in */
          UPDATE italus_waitlist.waitlist_entries
          SET name = $2, genre = $3, source = $4,
              marketing_opt_in = TRUE, marketing_consent_at = $5,
              beehiiv_sync_status = 'pending', updated_at = $5
          WHERE email = $1 AND marketing_opt_in = FALSE
            AND beehiiv_sync_status <> 'unsubscribed'
          RETURNING *`, [data.email, data.name, data.genre, data.source, current]);
        if (upgraded.length) {
          return { entry: mapEntry(upgraded[0]), shouldSyncBeehiiv: true, reactivateExisting: false };
        }

        const retry = await rows(sql, `/* retry_failed_sync */
          UPDATE italus_waitlist.waitlist_entries
          SET beehiiv_sync_status = 'pending', updated_at = $2
          WHERE email = $1 AND marketing_opt_in = TRUE AND beehiiv_sync_status = 'failed'
          RETURNING *`, [data.email, current]);
        if (retry.length) {
          return { entry: mapEntry(retry[0]), shouldSyncBeehiiv: true, reactivateExisting: false };
        }

        const resubscribed = await rows(sql, `/* resubscribe_unsubscribed */
          UPDATE italus_waitlist.waitlist_entries
          SET name = $2, genre = $3, source = $4,
              marketing_opt_in = TRUE, marketing_consent_at = $5,
              beehiiv_sync_status = 'pending', updated_at = $5
          WHERE email = $1 AND marketing_opt_in = FALSE
            AND beehiiv_sync_status = 'unsubscribed'
          RETURNING *`, [data.email, data.name, data.genre, data.source, current]);
        if (resubscribed.length) {
          return { entry: mapEntry(resubscribed[0]), shouldSyncBeehiiv: true, reactivateExisting: true };
        }
      }

      const updated = await rows(sql, `/* update_entry */
        UPDATE italus_waitlist.waitlist_entries
        SET name = $2, genre = $3, source = $4, updated_at = $5
        WHERE email = $1
        RETURNING *`, [data.email, data.name, data.genre, data.source, current]);
      return { entry: mapEntry(updated[0]), shouldSyncBeehiiv: false, reactivateExisting: false };
    },

    async markBeehiivSynced(email, subscriptionId) {
      const result = await rows(sql, `/* mark_synced */
        UPDATE italus_waitlist.waitlist_entries
        SET beehiiv_subscription_id = $2, beehiiv_sync_status = 'synced',
            beehiiv_synced_at = $3, updated_at = $3
        WHERE email = $1
        RETURNING *`, [email, subscriptionId, now()]);
      return mapEntry(result[0]);
    },

    async markBeehiivFailed(email) {
      const result = await rows(sql, `/* mark_failed */
        UPDATE italus_waitlist.waitlist_entries
        SET beehiiv_sync_status = 'failed', updated_at = $2
        WHERE email = $1
        RETURNING *`, [email, now()]);
      return mapEntry(result[0]);
    },

    async markBeehiivUnsubscribed(email, occurredAt) {
      const result = await rows(sql, `/* mark_unsubscribed */
        UPDATE italus_waitlist.waitlist_entries
        SET marketing_opt_in = FALSE, marketing_unsubscribed_at = $2,
            beehiiv_sync_status = 'unsubscribed', updated_at = $3
        WHERE email = $1
          AND (marketing_consent_at IS NULL OR marketing_consent_at <= $2)
        RETURNING *`, [email, occurredAt, now()]);
      return mapEntry(result[0]);
    },

    async listEntries() {
      const result = await rows(sql, `/* list_entries */
        SELECT * FROM italus_waitlist.waitlist_entries ORDER BY created_at DESC, id DESC`);
      return result.map(mapEntry);
    },

    async countEntries() {
      const result = await rows(sql, `/* count_entries */
        SELECT COUNT(*)::text AS count FROM italus_waitlist.waitlist_entries`);
      return Number(result[0]?.count ?? 0);
    }
  };
}
