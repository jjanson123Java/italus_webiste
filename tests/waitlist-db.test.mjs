import test from 'node:test';
import assert from 'node:assert/strict';
import { createWaitlistStore } from '../lib/waitlist-db.mjs';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function createMemorySql() {
  const entries = new Map();
  const attempts = [];

  return {
    entries,
    attempts,
    async query(text, params = []) {
      const operation = /\/\* ([a-z_]+) \*\//.exec(text)?.[1];
      if (operation === 'insert_entry') {
        const [email, name, genre, source, optIn, now] = params;
        if (entries.has(email)) return { rows: [] };
        const row = {
          id: entries.size + 1,
          email,
          name,
          genre,
          source,
          marketing_opt_in: optIn,
          marketing_consent_at: optIn ? now : null,
          marketing_unsubscribed_at: null,
          beehiiv_subscription_id: null,
          beehiiv_sync_status: optIn ? 'pending' : 'not_requested',
          beehiiv_synced_at: null,
          created_at: now,
          updated_at: now
        };
        entries.set(email, row);
        return { rows: [clone(row)] };
      }
      if (operation === 'upgrade_opt_in') {
        const [email, name, genre, source, now] = params;
        const row = entries.get(email);
        if (!row || row.marketing_opt_in || row.beehiiv_sync_status === 'unsubscribed') return { rows: [] };
        Object.assign(row, {
          name,
          genre,
          source,
          marketing_opt_in: true,
          marketing_consent_at: now,
          beehiiv_sync_status: 'pending',
          updated_at: now
        });
        return { rows: [clone(row)] };
      }
      if (operation === 'retry_failed_sync') {
        const [email, now] = params;
        const row = entries.get(email);
        if (!row || !row.marketing_opt_in || row.beehiiv_sync_status !== 'failed') return { rows: [] };
        Object.assign(row, { beehiiv_sync_status: 'pending', updated_at: now });
        return { rows: [clone(row)] };
      }
      if (operation === 'resubscribe_unsubscribed') {
        const [email, name, genre, source, now] = params;
        const row = entries.get(email);
        if (!row || row.marketing_opt_in || row.beehiiv_sync_status !== 'unsubscribed') return { rows: [] };
        Object.assign(row, {
          name,
          genre,
          source,
          marketing_opt_in: true,
          marketing_consent_at: now,
          beehiiv_sync_status: 'pending',
          updated_at: now
        });
        return { rows: [clone(row)] };
      }
      if (operation === 'update_entry') {
        const [email, name, genre, source, now] = params;
        const row = entries.get(email);
        Object.assign(row, { name, genre, source, updated_at: now });
        return { rows: [clone(row)] };
      }
      if (operation === 'mark_synced') {
        const [email, subscriptionId, now] = params;
        const row = entries.get(email);
        Object.assign(row, {
          beehiiv_subscription_id: subscriptionId,
          beehiiv_sync_status: 'synced',
          beehiiv_synced_at: now,
          updated_at: now
        });
        return { rows: [clone(row)] };
      }
      if (operation === 'mark_failed') {
        const [email, now] = params;
        const row = entries.get(email);
        Object.assign(row, { beehiiv_sync_status: 'failed', updated_at: now });
        return { rows: [clone(row)] };
      }
      if (operation === 'mark_unsubscribed') {
        const [email, occurredAt, now] = params;
        const row = entries.get(email);
        if (!row || (row.marketing_consent_at && row.marketing_consent_at > occurredAt)) return { rows: [] };
        Object.assign(row, {
          marketing_opt_in: false,
          marketing_unsubscribed_at: occurredAt,
          beehiiv_sync_status: 'unsubscribed',
          updated_at: now
        });
        return { rows: [clone(row)] };
      }
      if (operation === 'mark_confirmed') {
        const [email, subscriptionId, occurredAt, now] = params;
        const row = entries.get(email);
        if (!row || (row.marketing_unsubscribed_at && row.marketing_unsubscribed_at > occurredAt)) {
          return { rows: [] };
        }
        Object.assign(row, {
          marketing_opt_in: true,
          marketing_consent_at: occurredAt,
          beehiiv_subscription_id: subscriptionId,
          beehiiv_sync_status: 'synced',
          beehiiv_synced_at: now,
          updated_at: now
        });
        return { rows: [clone(row)] };
      }
      if (operation === 'rate_limit') {
        const [requestKey, action, cutoff, now] = params;
        for (let index = attempts.length - 1; index >= 0; index -= 1) {
          if (attempts[index].attemptedAt < cutoff) attempts.splice(index, 1);
        }
        const count = attempts.filter((item) => item.requestKey === requestKey && item.action === action).length;
        if (count >= 5) return { rows: [{ allowed: false }] };
        attempts.push({ requestKey, action, attemptedAt: now });
        return { rows: [{ allowed: true }] };
      }
      if (operation === 'rate_limit_cleanup') return { rows: [] };
      if (operation === 'list_entries') {
        return { rows: [...entries.values()].sort((a, b) => b.created_at.getTime() - a.created_at.getTime()).map(clone) };
      }
      if (operation === 'count_entries') return { rows: [{ count: String(entries.size) }] };
      throw new Error(`Unknown test query: ${operation}`);
    }
  };
}

function entry(overrides = {}) {
  return {
    name: 'Ada Author',
    email: 'ada@example.com',
    genre: 'Fantasy',
    source: 'updates',
    marketingOptIn: false,
    ...overrides
  };
}

test('stores one row for repeated and concurrent submissions', async () => {
  const sql = createMemorySql();
  const store = createWaitlistStore({ sql, now: () => new Date('2026-10-21T12:00:00Z') });

  const results = await Promise.all([
    store.upsertEntry(entry()),
    store.upsertEntry(entry({ name: 'Ada Revised' }))
  ]);

  assert.equal(sql.entries.size, 1);
  assert.equal(results.filter((result) => result.shouldSyncBeehiiv).length, 0);
  assert.equal((await store.countEntries()), 1);
});

test('explicitly types consent parameters used inside the PostgreSQL CASE expression', async () => {
  const current = new Date('2026-10-21T12:00:00Z');
  const sql = {
    async query(text, params) {
      if (!text.includes('/* insert_entry */')) throw new Error('Unexpected query.');
      if (!/CASE WHEN \$5::boolean THEN \$6::timestamptz ELSE NULL END/.test(text)) {
        const error = new Error('PostgreSQL could not resolve the CASE result as TIMESTAMPTZ.');
        error.code = '42804';
        throw error;
      }
      return { rows: [{
        id: 1,
        email: params[0],
        name: params[1],
        genre: params[2],
        source: params[3],
        marketing_opt_in: params[4],
        marketing_consent_at: current,
        beehiiv_subscription_id: null,
        beehiiv_sync_status: 'pending',
        beehiiv_synced_at: null,
        created_at: current,
        updated_at: current
      }] };
    }
  };
  const store = createWaitlistStore({ sql, now: () => current });

  const result = await store.upsertEntry(entry({ marketingOptIn: true }));

  assert.equal(result.entry.marketingConsentAt.toISOString(), current.toISOString());
  assert.equal(result.shouldSyncBeehiiv, true);
});

test('unchecked repeat preserves prior consent and does not request another sync', async () => {
  const sql = createMemorySql();
  const store = createWaitlistStore({ sql, now: () => new Date('2026-10-21T12:00:00Z') });
  const optedIn = await store.upsertEntry(entry({ marketingOptIn: true }));
  await store.markBeehiivSynced(entry().email, 'sub_123');
  const repeated = await store.upsertEntry(entry({ marketingOptIn: false, name: 'Updated Name' }));

  assert.equal(optedIn.shouldSyncBeehiiv, true);
  assert.equal(repeated.shouldSyncBeehiiv, false);
  assert.equal(repeated.entry.marketingOptIn, true);
  assert.equal(repeated.entry.beehiivSyncStatus, 'synced');
});

test('later checked repeat upgrades consent exactly once', async () => {
  const sql = createMemorySql();
  let current = new Date('2026-10-21T12:00:00Z');
  const store = createWaitlistStore({ sql, now: () => current });
  const initial = await store.upsertEntry(entry());
  current = new Date('2026-10-21T13:00:00Z');
  const [first, second] = await Promise.all([
    store.upsertEntry(entry({ marketingOptIn: true })),
    store.upsertEntry(entry({ marketingOptIn: true }))
  ]);

  assert.equal(initial.entry.marketingConsentAt, null);
  assert.equal([first, second].filter((result) => result.shouldSyncBeehiiv).length, 1);
  assert.equal(first.entry.createdAt.toISOString(), '2026-10-21T12:00:00.000Z');
  assert.equal(sql.entries.get(entry().email).updated_at.toISOString(), '2026-10-21T13:00:00.000Z');
});

test('later checked repeat retries one failed Beehiiv synchronization exactly once', async () => {
  const sql = createMemorySql();
  let current = new Date('2026-10-21T12:00:00Z');
  const store = createWaitlistStore({ sql, now: () => current });
  await store.upsertEntry(entry({ marketingOptIn: true }));
  await store.markBeehiivFailed(entry().email);
  current = new Date('2026-10-21T13:00:00Z');

  const results = await Promise.all([
    store.upsertEntry(entry({ marketingOptIn: true })),
    store.upsertEntry(entry({ marketingOptIn: true }))
  ]);

  assert.equal(results.filter((result) => result.shouldSyncBeehiiv).length, 1);
  assert.equal(sql.entries.get(entry().email).beehiiv_sync_status, 'pending');
});

test('verified unsubscribe becomes inactive and a later checked submission requests one reactivation', async () => {
  const sql = createMemorySql();
  let current = new Date('2026-10-21T12:00:00Z');
  const store = createWaitlistStore({ sql, now: () => current });
  await store.upsertEntry(entry({ marketingOptIn: true }));
  await store.markBeehiivSynced(entry().email, 'sub_123');

  const unsubscribedAt = new Date('2026-10-21T13:00:00Z');
  const unsubscribed = await store.markBeehiivUnsubscribed(entry().email, unsubscribedAt);
  assert.equal(unsubscribed.marketingOptIn, false);
  assert.equal(unsubscribed.beehiivSyncStatus, 'unsubscribed');
  assert.equal(unsubscribed.marketingUnsubscribedAt.toISOString(), unsubscribedAt.toISOString());

  current = new Date('2026-10-21T14:00:00Z');
  const results = await Promise.all([
    store.upsertEntry(entry({ marketingOptIn: true })),
    store.upsertEntry(entry({ marketingOptIn: true }))
  ]);

  assert.equal(results.filter((result) => result.shouldSyncBeehiiv).length, 1);
  assert.equal(results.filter((result) => result.reactivateExisting).length, 1);
  assert.equal(sql.entries.get(entry().email).marketing_consent_at.toISOString(), current.toISOString());
  assert.equal(sql.entries.get(entry().email).beehiiv_sync_status, 'pending');
});

test('stale unsubscribe event cannot erase newer explicit consent', async () => {
  const sql = createMemorySql();
  const consentAt = new Date('2026-10-21T14:00:00Z');
  const store = createWaitlistStore({ sql, now: () => consentAt });
  await store.upsertEntry(entry({ marketingOptIn: true }));
  await store.markBeehiivSynced(entry().email, 'sub_123');

  const result = await store.markBeehiivUnsubscribed(
    entry().email,
    new Date('2026-10-21T13:00:00Z')
  );

  assert.equal(result, null);
  assert.equal(sql.entries.get(entry().email).marketing_opt_in, true);
  assert.equal(sql.entries.get(entry().email).beehiiv_sync_status, 'synced');
});

test('verified Beehiiv confirmation restores marketing consent in Neon', async () => {
  const sql = createMemorySql();
  let current = new Date('2026-10-21T12:00:00Z');
  const store = createWaitlistStore({ sql, now: () => current });
  await store.upsertEntry(entry({ marketingOptIn: true }));
  await store.markBeehiivSynced(entry().email, 'sub_123');
  await store.markBeehiivUnsubscribed(entry().email, new Date('2026-10-21T13:00:00Z'));

  current = new Date('2026-10-21T14:01:00Z');
  const confirmedAt = new Date('2026-10-21T14:00:00Z');
  const result = await store.markBeehiivConfirmed(entry().email, 'sub_renewed', confirmedAt);

  assert.equal(result.marketingOptIn, true);
  assert.equal(result.marketingConsentAt.toISOString(), confirmedAt.toISOString());
  assert.equal(result.beehiivSyncStatus, 'synced');
  assert.equal(result.beehiivSubscriptionId, 'sub_renewed');
  assert.equal(result.marketingUnsubscribedAt.toISOString(), '2026-10-21T13:00:00.000Z');
});

test('stale Beehiiv confirmation cannot override a newer unsubscribe', async () => {
  const sql = createMemorySql();
  let current = new Date('2026-10-21T12:00:00Z');
  const store = createWaitlistStore({ sql, now: () => current });
  await store.upsertEntry(entry({ marketingOptIn: true }));
  await store.markBeehiivUnsubscribed(entry().email, new Date('2026-10-21T14:00:00Z'));

  current = new Date('2026-10-21T15:00:00Z');
  const result = await store.markBeehiivConfirmed(
    entry().email,
    'sub_stale',
    new Date('2026-10-21T13:00:00Z')
  );

  assert.equal(result, null);
  assert.equal(sql.entries.get(entry().email).marketing_opt_in, false);
  assert.equal(sql.entries.get(entry().email).beehiiv_sync_status, 'unsubscribed');
});

test('tracks independent public and admin rate-limit buckets', async () => {
  const sql = createMemorySql();
  const store = createWaitlistStore({ sql, now: () => new Date('2026-10-21T12:00:00Z') });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(await store.checkRateLimit('key', 'waitlist'), true);
  }
  assert.equal(await store.checkRateLimit('key', 'waitlist'), false);
  assert.equal(await store.checkRateLimit('key', 'admin_auth'), true);
});

test('records sync transitions and lists newest entries first', async () => {
  const sql = createMemorySql();
  let current = new Date('2026-10-21T12:00:00Z');
  const store = createWaitlistStore({ sql, now: () => current });
  await store.upsertEntry(entry({ marketingOptIn: true }));
  await store.markBeehiivFailed(entry().email);
  assert.equal((await store.listEntries())[0].beehiivSyncStatus, 'failed');
  await store.markBeehiivSynced(entry().email, 'sub_123');

  current = new Date('2026-10-21T14:00:00Z');
  await store.upsertEntry(entry({ email: 'new@example.com', marketingOptIn: false }));
  const listed = await store.listEntries();

  assert.equal(listed[0].email, 'new@example.com');
  assert.equal(listed[1].beehiivSyncStatus, 'synced');
  assert.equal(listed[1].beehiivSubscriptionId, 'sub_123');
});
