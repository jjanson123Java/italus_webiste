import { timingSafeEqual } from 'node:crypto';
import { createCommunityStore } from '../lib/community-db.mjs';

function authorized(header, secret) {
  if (!secret || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const actual = Buffer.from(header.slice(7)); const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function createCommunityCleanupHandler({ store, env = process.env }) { return async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  if (!authorized(req.headers?.authorization, env.CRON_SECRET)) return res.status(401).json({ ok: false });
  try { return res.status(200).json({ ok: true, deleted: await store.cleanup() }); }
  catch { return res.status(503).json({ ok: false }); }
}; }
export default async function handler(req, res) { try { return await createCommunityCleanupHandler({ store: createCommunityStore(), env: process.env })(req, res); } catch { res.setHeader('Cache-Control', 'no-store'); return res.status(503).json({ ok: false }); } }
