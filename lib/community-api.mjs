import { createCommunityRequestFingerprint, hashUserAgent } from './community-security.mjs';

export function publicHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
export function send(res, status, body) { return res.status(status).json(body); }
export function approvedOrigin(origin) {
  return origin === 'https://italusbooks.com' || origin === 'https://www.italusbooks.com' || /^https:\/\/italus-website(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin ?? '') || /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin ?? '');
}
export function bodyFrom(req) { return typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
export function bodySize(req) { const n = Number(req.headers?.['content-length']); return Number.isFinite(n) ? n : Buffer.byteLength(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? null)); }
export function clientIp(req) { return String(req.headers?.['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'unknown').split(',')[0].trim(); }
export function requestContext(req, env) {
  const userAgent = String(req.headers?.['user-agent'] ?? '');
  return { requestFingerprint: createCommunityRequestFingerprint(clientIp(req), 'ip', env.COMMUNITY_REQUEST_HASH_SECRET), userAgentHash: hashUserAgent(userAgent, env.COMMUNITY_REQUEST_HASH_SECRET) };
}
export function validatePost(req, res) {
  publicHeaders(res);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); send(res, 405, { ok: false, message: 'Method not allowed.' }); return false; }
  if (!String(req.headers?.['content-type'] ?? '').toLowerCase().startsWith('application/json')) { send(res, 415, { ok: false, message: 'JSON is required.' }); return false; }
  if (bodySize(req) > 4096) { send(res, 413, { ok: false, message: 'Request is too large.' }); return false; }
  if (!approvedOrigin(req.headers?.origin)) { send(res, 403, { ok: false, message: 'Origin not allowed.' }); return false; }
  return true;
}
