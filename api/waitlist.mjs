import { createBeehiivClient } from '../lib/beehiiv.mjs';
import { createWaitlistStore } from '../lib/waitlist-db.mjs';
import { createRequestKey, validateWaitlistPayload } from '../lib/waitlist-security.mjs';

const SUCCESS = { ok: true, message: "You're on the Italus waitlist." };
const MAX_BODY_BYTES = 4096;

function approvedOrigin(origin) {
  if (origin === 'https://italusbooks.com' || origin === 'https://www.italusbooks.com') return true;
  return /^https:\/\/italus-website(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin ?? '');
}

function publicHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function send(res, status, body) {
  return res.status(status).json(body);
}

function payloadFrom(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

function bodySize(req) {
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared >= 0) return declared;
  return Buffer.byteLength(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? null));
}

function clientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded ?? req.socket?.remoteAddress ?? 'unknown')
    .split(',')[0]
    .trim();
}

function safeErrorCode(error) {
  const code = String(error?.code ?? '');
  return /^[a-z0-9]{5}$/i.test(code) ? code : 'unknown';
}

export function createWaitlistHandler({ store, beehiiv, env, logger = console }) {
  return async function waitlistHandler(req, res) {
    publicHeaders(res);
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, { ok: false, message: 'Method not allowed.' });
    }
    if (!String(req.headers?.['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
      return send(res, 415, { ok: false, message: 'JSON is required.' });
    }
    if (bodySize(req) > MAX_BODY_BYTES) {
      return send(res, 413, { ok: false, message: 'Submission is too large.' });
    }
    if (!approvedOrigin(req.headers?.origin)) {
      return send(res, 403, { ok: false, message: 'Origin not allowed.' });
    }

    let payload;
    try {
      payload = payloadFrom(req);
    } catch {
      return send(res, 400, { ok: false, message: 'Invalid JSON.' });
    }
    const validation = validateWaitlistPayload(payload);
    if (!validation.ok) {
      return send(res, 400, { ok: false, message: validation.errors[0] });
    }
    if (validation.data.website) return send(res, 200, SUCCESS);

    let phase = 'rate_limit';
    try {
      const requestKey = createRequestKey(clientIp(req), env.WAITLIST_IP_HASH_SECRET);
      if (!(await store.checkRateLimit(requestKey, 'waitlist'))) {
        return send(res, 429, { ok: false, message: 'Please wait before trying again.' });
      }

      phase = 'upsert_entry';
      const result = await store.upsertEntry(validation.data);
      if (result.shouldSyncBeehiiv) {
        phase = 'beehiiv_sync';
        try {
          const subscription = await beehiiv.subscribe({
            email: validation.data.email,
            name: validation.data.name,
            source: validation.data.source
          });
          await store.markBeehiivSynced(validation.data.email, subscription.subscriptionId);
        } catch {
          await store.markBeehiivFailed(validation.data.email);
          logger.error('Beehiiv synchronization failed for a waitlist entry.');
        }
      }
      return send(res, 200, SUCCESS);
    } catch (error) {
      logger.error('Waitlist submission failed.', { phase, code: safeErrorCode(error) });
      return send(res, 500, { ok: false, message: 'Unable to join right now. Please try again.' });
    }
  };
}

export default async function handler(req, res) {
  try {
    const store = createWaitlistStore();
    const beehiiv = {
      subscribe(data) {
        return createBeehiivClient().subscribe(data);
      }
    };
    return await createWaitlistHandler({ store, beehiiv, env: process.env })(req, res);
  } catch {
    publicHeaders(res);
    return send(res, 500, { ok: false, message: 'Unable to join right now. Please try again.' });
  }
}
