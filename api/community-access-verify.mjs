import { createCommunityStore } from '../lib/community-db.mjs';
import { COMMUNITY_TERMS } from '../js/community-terms.generated.mjs';
import { bodyFrom, requestContext, send, validatePost } from '../lib/community-api.mjs';
import { createSessionToken, digestOtp, digestSessionToken, getCommunityDestination, serializeSessionCookie } from '../lib/community-security.mjs';

export function createCommunityAccessVerifyHandler({ store, env, now = () => new Date(), digestCode = digestOtp, createToken = createSessionToken }) {
  return async (req, res) => {
    if (!validatePost(req, res)) return;
    let body; try { body = bodyFrom(req); } catch { return send(res, 400, { ok: false, message: 'Invalid JSON.' }); }
    if (body?.accepted !== true || body?.ageConfirmed !== true) return send(res, 400, { ok: false, message: 'You must confirm the disclosure and that you are at least 18.' });
    if (!/^[\w-]{1,100}$/.test(String(body.challengeId ?? '')) || !/^\d{6}$/.test(String(body.code ?? ''))) return send(res, 400, { ok: false, message: 'The verification code is invalid or expired.' });
    try {
      const context = requestContext(req, env); const challenge = await store.findChallenge(body.challengeId); const current = now();
      const currentTerms = challenge?.termsVersion === COMMUNITY_TERMS.version && challenge?.documentSha256 === COMMUNITY_TERMS.documentSha256;
      const usable = challenge && !challenge.consumedAt && challenge.failedAttempts < 5 && challenge.expiresAt > current && currentTerms;
      if (!usable || digestCode(body.code, challenge.id, env.COMMUNITY_OTP_SECRET) !== challenge.codeDigest) {
        if (usable) await store.recordFailedAttempt(challenge.id);
        return send(res, 400, { ok: false, message: currentTerms === false ? 'The community terms changed. Request a new code.' : 'The verification code is invalid or expired.' });
      }
      const token = createToken(); const sessionExpiresAt = new Date(current.getTime() + 30 * 24 * 60 * 60_000);
      const completed = await store.completeVerification({ challengeId: challenge.id, sessionDigest: digestSessionToken(token, env.COMMUNITY_SESSION_SECRET), sessionExpiresAt, requestFingerprint: context.requestFingerprint, userAgentHash: context.userAgentHash, locale: String(req.headers?.['accept-language'] ?? '').slice(0, 64) });
      if (!completed) return send(res, 400, { ok: false, message: 'The verification code is invalid or expired.' });
      res.setHeader('Set-Cookie', serializeSessionCookie(token, sessionExpiresAt));
      return send(res, 200, { ok: true, destination: getCommunityDestination(challenge.channel) });
    } catch { return send(res, 500, { ok: false, message: 'Unable to verify right now. Please try again.' }); }
  };
}
export default async function handler(req, res) { try { return await createCommunityAccessVerifyHandler({ store: createCommunityStore(), env: process.env })(req, res); } catch { return send(res, 500, { ok: false, message: 'Unable to verify right now. Please try again.' }); } }
