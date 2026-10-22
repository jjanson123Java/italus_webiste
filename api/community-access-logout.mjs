import { createCommunityStore } from '../lib/community-db.mjs';
import { bodyFrom, publicHeaders, send } from '../lib/community-api.mjs';
import { clearSessionCookie, digestSessionToken, parseSessionCookie } from '../lib/community-security.mjs';

export function createCommunityLogoutHandler({ store, env }) { return async (req, res) => {
  publicHeaders(res); if (req.method !== 'POST') return send(res, 405, { ok: false, message: 'Method not allowed.' });
  const token = parseSessionCookie(req.headers);
  try { if (token) await store.revokeSession(digestSessionToken(token, env.COMMUNITY_SESSION_SECRET)); }
  catch { res.setHeader('Set-Cookie', clearSessionCookie()); return send(res, 500, { ok: false, message: 'Your browser session was cleared, but server revocation could not be confirmed.' }); }
  res.setHeader('Set-Cookie', clearSessionCookie()); return send(res, 200, { ok: true });
}; }
export default async function handler(req, res) { try { return await createCommunityLogoutHandler({ store: createCommunityStore(), env: process.env })(req, res); } catch { publicHeaders(res); res.setHeader('Set-Cookie', clearSessionCookie()); return send(res, 500, { ok: false, message: 'Your browser session was cleared, but server revocation could not be confirmed.' }); } }
