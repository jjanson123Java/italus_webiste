import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const SOURCES = new Set(['home', 'updates']);
const GENRES = new Set([
  'Fiction / general',
  'Fantasy',
  'Mystery / thriller',
  'Science fiction',
  'Romance',
  'Other'
]);

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateWaitlistPayload(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const name = String(input.name ?? '').trim();
  const email = normalizeEmail(input.email);
  const genreText = String(input.genre ?? '').trim();
  const genre = genreText || null;
  const source = String(input.source ?? '').trim();
  const website = String(input.website ?? '').trim();
  const errors = [];

  if (!name || name.length > 120) errors.push('Enter a name between 1 and 120 characters.');
  if (!validEmail(email)) errors.push('Enter a valid email address.');
  if (genre && !GENRES.has(genre)) errors.push('Choose a valid genre.');
  if (!SOURCES.has(source)) errors.push('Choose a valid form source.');
  if (typeof input.marketingOptIn !== 'boolean') errors.push('Choose whether to receive email updates.');
  if (website.length > 200) errors.push('Invalid form submission.');

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    data: {
      name,
      email,
      genre,
      source,
      marketingOptIn: input.marketingOptIn,
      website
    }
  };
}

export function createRequestKey(ip, secret) {
  if (!secret) throw new Error('WAITLIST_IP_HASH_SECRET is required.');
  return createHmac('sha256', secret).update(String(ip ?? 'unknown')).digest('hex');
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest();
}

export function isAuthorizedBasicAuth(header, username, password) {
  if (typeof header !== 'string' || !header.startsWith('Basic ')) return false;
  try {
    const encoded = header.slice(6).trim();
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    const suppliedUsername = decoded.slice(0, separator);
    const suppliedPassword = decoded.slice(separator + 1);
    return timingSafeEqual(digest(suppliedUsername), digest(username))
      && timingSafeEqual(digest(suppliedPassword), digest(password));
  } catch {
    return false;
  }
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeCsvCell(value) {
  let text = String(value ?? '');
  if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
