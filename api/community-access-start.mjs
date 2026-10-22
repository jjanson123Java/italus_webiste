import { randomUUID } from 'node:crypto';
import { createCommunityStore } from '../lib/community-db.mjs';
import { createCommunityMailer } from '../lib/community-mailer.mjs';
import { COMMUNITY_TERMS } from '../js/community-terms.generated.mjs';
import { bodyFrom, requestContext, send, validatePost } from '../lib/community-api.mjs';
import { createCommunityRequestFingerprint, createOtp, digestOtp, getCommunityChannelLabel, normalizeCommunityEmail, validateChannelSlug } from '../lib/community-security.mjs';

const GENERIC = 'If the address can receive mail, a verification code is on its way.';
export function createCommunityAccessStartHandler({ store, mailer, env, now = () => new Date(), randomId = randomUUID, createCode = createOtp, logger = console }) {
  return async (req, res) => {
    if (!validatePost(req, res)) return;
    let body;
    try { body = bodyFrom(req); } catch { return send(res, 400, { ok: false, message: 'Invalid JSON.' }); }
    let email, channel, context;
    try { email = normalizeCommunityEmail(body?.email); channel = validateChannelSlug(body?.channel); context = requestContext(req, env); }
    catch (error) { return send(res, 400, { ok: false, message: error.message }); }
    try {
      const emailKey = createCommunityRequestFingerprint(email, 'email', env.COMMUNITY_REQUEST_HASH_SECRET);
      const emailAllowed = await store.checkRateLimit(emailKey, 'otp_start_email', 5, 60);
      const requestAllowed = await store.checkRateLimit(context.requestFingerprint, 'otp_start_ip', 20, 60);
      if (!emailAllowed || !requestAllowed) return send(res, 429, { ok: false, message: 'Please wait before trying again.' });
      const id = randomId(); const code = createCode(); const current = now();
      await store.replaceChallenge({ id, email, codeDigest: digestOtp(code, id, env.COMMUNITY_OTP_SECRET), termsVersion: COMMUNITY_TERMS.version, documentSha256: COMMUNITY_TERMS.documentSha256, channel, expiresAt: new Date(current.getTime() + 10 * 60_000), resendAfter: new Date(current.getTime() + 60_000), requestFingerprint: context.requestFingerprint });
      await mailer.sendCode({ email, code, channel: getCommunityChannelLabel(channel) });
      return send(res, 200, { ok: true, challengeId: id, message: GENERIC });
    } catch { logger.error('Community verification start failed.'); return send(res, 500, { ok: false, message: 'Unable to send a code right now. Please try again.' }); }
  };
}
export default async function handler(req, res) { try { return await createCommunityAccessStartHandler({ store: createCommunityStore(), mailer: createCommunityMailer(), env: process.env })(req, res); } catch { return send(res, 500, { ok: false, message: 'Unable to send a code right now. Please try again.' }); } }
