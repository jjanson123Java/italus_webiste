import { createHmac, randomBytes, randomInt } from 'node:crypto';

export const COMMUNITY_DESTINATIONS = Object.freeze({
  community: { label: 'Writer’s Block Community', url: 'https://writers-block.beehiiv.com/community' },
  'writers-room': { label: 'Writer’s Room', url: 'https://writers-block.beehiiv.com/community/channels/writer-s-room' },
  'italus-bookshelf': { label: 'From the Italus Bookshelf', url: 'https://writers-block.beehiiv.com/community/channels/italus-bookshelf' },
  'manuscript-lab': { label: 'Manuscript Lab', url: 'https://writers-block.beehiiv.com/community/channels/manuscript-lab' },
  'worlds-characters': { label: 'Worlds & Characters', url: 'https://writers-block.beehiiv.com/community/channels/worlds-characters' }
});

export function normalizeCommunityEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  return email;
}

export function validateChannelSlug(value) {
  const slug = String(value ?? '');
  if (!Object.hasOwn(COMMUNITY_DESTINATIONS, slug)) throw new Error('Invalid community destination.');
  return slug;
}

export function getCommunityDestination(slug) { return COMMUNITY_DESTINATIONS[validateChannelSlug(slug)].url; }
export function getCommunityChannelLabel(slug) { return COMMUNITY_DESTINATIONS[validateChannelSlug(slug)].label; }
export function createOtp() { return String(randomInt(0, 1_000_000)).padStart(6, '0'); }
function digest(value, context, secret) {
  if (!secret) throw new Error('Community security is not configured.');
  return createHmac('sha256', secret).update(`${context}\0${value}`).digest('hex');
}
export function digestOtp(code, challengeId, secret) { return digest(code, `otp:${challengeId}`, secret); }
export function createSessionToken() { return randomBytes(32).toString('base64url'); }
export function digestSessionToken(token, secret) { return digest(token, 'session', secret); }
export function createCommunityRequestFingerprint(ip, userAgent, secret) { return digest(`${ip}\0${userAgent}`, 'request', secret); }
export function hashUserAgent(userAgent, secret) { return digest(String(userAgent ?? ''), 'user-agent', secret); }

export function serializeSessionCookie(token, expiresAt) {
  return `italus_community_session=${encodeURIComponent(token)}; Expires=${expiresAt.toUTCString()}; Max-Age=${Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))}; HttpOnly; Secure; SameSite=Lax; Path=/`;
}
export function clearSessionCookie() { return 'italus_community_session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/'; }
export function parseSessionCookie(headers = {}) {
  const raw = String(headers.cookie ?? headers.Cookie ?? '');
  const match = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith('italus_community_session='));
  if (!match) return null;
  try { return decodeURIComponent(match.slice(match.indexOf('=') + 1)) || null; } catch { return null; }
}
