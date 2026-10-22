import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunityMailer } from '../lib/community-mailer.mjs';

test('sends a ten-minute community code through Resend with reply routing', async () => {
  let request;
  const mailer = createCommunityMailer({ apiKey: 'resend_secret', from: 'Italus Community <access@community.italusbooks.com>', replyTo: 'support@italusbooks.com', fetchImpl: async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'email_123' }), { status: 200 });
  }});
  await mailer.sendCode({ email: 'author@example.com', code: '123456', channel: 'Writer’s Room' });
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.headers.authorization, 'Bearer resend_secret');
  assert.deepEqual(body.to, ['author@example.com']);
  assert.equal(body.reply_to, 'support@italusbooks.com');
  assert.match(body.text, /123456/);
  assert.match(body.text, /10 minutes/);
  assert.match(body.text, /Writer’s Room/);
});

test('fails closed for missing config, provider rejection, or malformed response without leaking secrets', async () => {
  assert.throws(() => createCommunityMailer({ apiKey: '', from: 'x' }), /not configured/i);
  const rejected = createCommunityMailer({ apiKey: 'never-leak', from: 'x@y.com', fetchImpl: async () => new Response('provider secret', { status: 500 }) });
  await assert.rejects(rejected.sendCode({ email: 'a@b.com', code: '123456', channel: 'Community' }), (error) => {
    assert.doesNotMatch(error.message, /never-leak|provider secret|123456/);
    return true;
  });
  const malformed = createCommunityMailer({ apiKey: 'key', from: 'x@y.com', fetchImpl: async () => new Response('{}', { status: 200 }) });
  await assert.rejects(malformed.sendCode({ email: 'a@b.com', code: '123456', channel: 'Community' }), /invalid response/i);
});
