import { Webhook } from 'svix';

export function verifyBeehiivWebhook(rawBody, headers, secret) {
  if (!secret) throw new Error('Beehiiv webhook verification is not configured.');
  return new Webhook(secret).verify(rawBody, {
    'svix-id': String(headers?.['svix-id'] ?? ''),
    'svix-timestamp': String(headers?.['svix-timestamp'] ?? ''),
    'svix-signature': String(headers?.['svix-signature'] ?? '')
  });
}
