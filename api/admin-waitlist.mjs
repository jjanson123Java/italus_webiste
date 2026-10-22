import { createWaitlistStore } from '../lib/waitlist-db.mjs';
import { createCommunityStore } from '../lib/community-db.mjs';
import {
  createRequestKey,
  escapeCsvCell,
  escapeHtml,
  isAuthorizedBasicAuth
} from '../lib/waitlist-security.mjs';

function setSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.status(status);
  res.setHeader('Content-Type', contentType);
  return typeof res.send === 'function' ? res.send(body) : res.end(body);
}

function requestIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
}

function iso(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function renderHtml(entries, count, communityEvidence = []) {
  const rows = entries.map((item) => `<tr>
<td>${escapeHtml(iso(item.createdAt))}</td>
<td>${escapeHtml(item.name)}</td>
<td>${escapeHtml(item.email)}</td>
<td>${escapeHtml(item.genre || '—')}</td>
<td>${escapeHtml(item.source)}</td>
<td>Marketing: ${item.marketingOptIn ? 'yes' : 'no'}</td>
<td>Beehiiv: ${escapeHtml(item.beehiivSyncStatus || 'not_requested')}</td>
</tr>`).join('');
  const evidenceRows = communityEvidence.map((item) => `<tr><td>${escapeHtml(iso(item.acceptedAt))}</td><td>${escapeHtml(item.email)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.termsVersion)}</td><td>${escapeHtml(item.latestEvent || '—')}</td><td>${escapeHtml(iso(item.latestEventAt))}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Italus waitlist administration</title><style>body{font:16px system-ui,sans-serif;max-width:1200px;margin:2rem auto;padding:0 1rem;color:#171a18}table{border-collapse:collapse;width:100%;margin-bottom:3rem}caption{text-align:left;font-weight:700;margin:1rem 0}th,td{border:1px solid #bbb;padding:.55rem;text-align:left;vertical-align:top}th{background:#eee}.actions{display:flex;gap:1rem;align-items:center;flex-wrap:wrap}</style></head><body><main><h1>Italus waitlist</h1><div class="actions"><strong>${escapeHtml(count)} waitlist entries</strong><a href="?format=csv">Download CSV</a></div><table><caption>Newest submissions first</caption><thead><tr><th>Joined</th><th>Name</th><th>Email</th><th>Genre</th><th>Source</th><th>Consent</th><th>Newsletter</th></tr></thead><tbody>${rows}</tbody></table><h2>Community acceptance evidence</h2><table><caption>Versioned, verified acceptances and latest access state</caption><thead><tr><th>Accepted</th><th>Email</th><th>Status</th><th>Terms</th><th>Latest event</th><th>Event time</th></tr></thead><tbody>${evidenceRows}</tbody></table></main></body></html>`;
}

function renderCsv(entries) {
  const header = ['created_at', 'name', 'email', 'genre', 'source', 'marketing_opt_in', 'marketing_consent_at', 'beehiiv_sync_status'];
  const lines = [header.map(escapeCsvCell).join(',')];
  for (const item of entries) {
    lines.push([
      iso(item.createdAt), item.name, item.email, item.genre || '', item.source,
      item.marketingOptIn ? 'yes' : 'no', iso(item.marketingConsentAt), item.beehiivSyncStatus || 'not_requested'
    ].map(escapeCsvCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export function createAdminWaitlistHandler({ store, communityStore, env = process.env } = {}) {
  return async function adminWaitlistHandler(req, res) {
    setSecurityHeaders(res);
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return send(res, 405, 'Method not allowed.');
    }

    const username = env.WAITLIST_ADMIN_USERNAME || 'admin';
    const password = env.WAITLIST_ADMIN_PASSWORD;
    const hashSecret = env.WAITLIST_IP_HASH_SECRET;
    if (!store || !password || !hashSecret) return send(res, 503, 'Administrator access is unavailable.');

    const authorized = isAuthorizedBasicAuth(req.headers?.authorization, username, password);
    if (!authorized) {
      try {
        const key = createRequestKey(requestIp(req), hashSecret);
        const allowed = await store.checkRateLimit(key, 'admin_auth');
        if (!allowed) return send(res, 429, 'Too many attempts. Please try again later.');
      } catch {
        return send(res, 503, 'Administrator access is unavailable.');
      }
      res.setHeader('WWW-Authenticate', 'Basic realm="Italus waitlist", charset="UTF-8"');
      return send(res, 401, 'Authentication required.');
    }

    try {
      const entries = await store.listEntries();
      if (req.query?.format === 'csv') {
        res.setHeader('Content-Disposition', 'attachment; filename="italus-waitlist.csv"');
        return send(res, 200, renderCsv(entries), 'text/csv; charset=utf-8');
      }
      const count = await store.countEntries();
      const communityEvidence = communityStore ? await communityStore.listEvidence() : [];
      return send(res, 200, renderHtml(entries, count, communityEvidence), 'text/html; charset=utf-8');
    } catch {
      return send(res, 503, 'Waitlist data is temporarily unavailable.');
    }
  };
}

export default async function handler(req, res) {
  try {
    const adminHandler = createAdminWaitlistHandler({ store: createWaitlistStore(), communityStore: createCommunityStore(), env: process.env });
    return await adminHandler(req, res);
  } catch {
    setSecurityHeaders(res);
    return send(res, 503, 'Administrator access is unavailable.');
  }
}
