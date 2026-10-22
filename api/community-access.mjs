import { createCommunityStore } from '../lib/community-db.mjs';
import { COMMUNITY_TERMS } from '../js/community-terms.generated.mjs';
import { bodyFrom, requestContext, send, validatePost } from '../lib/community-api.mjs';
import { digestSessionToken, getCommunityDestination, parseSessionCookie, validateChannelSlug } from '../lib/community-security.mjs';

export function createCommunityAccessHandler({ store, env }) { return async (req, res) => {
  if (!validatePost(req, res)) return;
  let body, channel; try { body = bodyFrom(req); channel = validateChannelSlug(body?.channel); } catch { return send(res, 400, { ok: false, message: 'Invalid community destination.' }); }
  const token = parseSessionCookie(req.headers); if (!token) return send(res, 401, { ok: false, verificationRequired: true });
  try {
    const context = requestContext(req, env);
    if (!(await store.checkRateLimit(context.requestFingerprint, 'trusted_access_ip', 120, 60))) return send(res, 429, { ok: false, message: 'Please wait before trying again.' });
    const session = await store.findTrustedSession(digestSessionToken(token, env.COMMUNITY_SESSION_SECRET), COMMUNITY_TERMS.version);
    if (!session) return send(res, 401, { ok: false, verificationRequired: true });
    await store.recordAccess({ eventType: 'trusted_access', email: session.email, termsVersion: COMMUNITY_TERMS.version, channel, ...context });
    return send(res, 200, { ok: true, destination: getCommunityDestination(channel) });
  } catch { return send(res, 500, { ok: false, message: 'Unable to open the community right now.' }); }
}; }
export default async function handler(req, res) { try { return await createCommunityAccessHandler({ store: createCommunityStore(), env: process.env })(req, res); } catch { return send(res, 500, { ok: false, message: 'Unable to open the community right now.' }); } }
