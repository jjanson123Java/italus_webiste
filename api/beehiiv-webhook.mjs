import { WebhookVerificationError } from 'svix';

import { verifyBeehiivWebhook } from '../lib/beehiiv-webhook.mjs';
import { createWaitlistStore } from '../lib/waitlist-db.mjs';
import { normalizeEmail } from '../lib/waitlist-security.mjs';

const MAX_BODY_BYTES = 64 * 1024;

export const config = {
  api: { bodyParser: false }
};

function secureHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function send(res, status, body) {
  return res.status(status).json(body);
}

async function readRawBody(req) {
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw Object.assign(new Error('Webhook body is too large.'), { code: 'BODY_TOO_LARGE' });
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error('Webhook body is too large.'), { code: 'BODY_TOO_LARGE' });
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function deletionData(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (payload.event_type !== 'subscription.deleted') return { ignored: true };
  const email = normalizeEmail(payload.data?.email);
  const timestamp = Number(payload.event_timestamp);
  if (!validEmail(email) || !Number.isInteger(timestamp) || timestamp <= 0) return null;
  const occurredAt = new Date(timestamp * 1000);
  if (Number.isNaN(occurredAt.getTime())) return null;
  return { ignored: false, email, occurredAt };
}

function safeEventId(payload) {
  const value = String(payload?.uid ?? 'unknown');
  return /^evt_[a-z0-9-]{1,80}$/i.test(value) ? value : 'unknown';
}

export function createBeehiivWebhookHandler({ store, env, logger = console }) {
  return async function beehiivWebhookHandler(req, res) {
    secureHeaders(res);
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, { ok: false });
    }

    let rawBody;
    try {
      rawBody = await readRawBody(req);
    } catch (error) {
      if (error?.code === 'BODY_TOO_LARGE') return send(res, 413, { ok: false });
      return send(res, 400, { ok: false });
    }

    let payload;
    try {
      payload = verifyBeehiivWebhook(rawBody, req.headers, env.BEEHIIV_WEBHOOK_SECRET);
    } catch (error) {
      if (error instanceof WebhookVerificationError) return send(res, 401, { ok: false });
      if (error instanceof SyntaxError) return send(res, 400, { ok: false });
      logger.error('Beehiiv webhook verification failed.', { phase: 'verification' });
      return send(res, 500, { ok: false });
    }

    const deletion = deletionData(payload);
    if (!deletion) return send(res, 400, { ok: false });
    if (deletion.ignored) return send(res, 200, { ok: true });

    try {
      await store.markBeehiivUnsubscribed(deletion.email, deletion.occurredAt);
      return send(res, 200, { ok: true });
    } catch {
      logger.error('Beehiiv webhook database update failed.', {
        phase: 'database',
        eventId: safeEventId(payload)
      });
      return send(res, 500, { ok: false });
    }
  };
}

export default async function handler(req, res) {
  try {
    return await createBeehiivWebhookHandler({
      store: createWaitlistStore(),
      env: process.env
    })(req, res);
  } catch {
    secureHeaders(res);
    return send(res, 500, { ok: false });
  }
}
