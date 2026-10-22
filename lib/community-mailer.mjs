export function createCommunityMailer({ fetchImpl = fetch, apiKey = process.env.RESEND_API_KEY, from = process.env.COMMUNITY_EMAIL_FROM, replyTo = process.env.COMMUNITY_EMAIL_REPLY_TO, timeoutMs = 8000 } = {}) {
  if (!apiKey || !from) throw new Error('Community email is not configured.');
  return {
    async sendCode({ email, code, channel }) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST', signal: controller.signal,
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            from, to: [email], ...(replyTo ? { reply_to: replyTo } : {}),
            subject: 'Your Italus community verification code',
            text: `Your Italus verification code is ${code}.\n\nIt expires in 10 minutes. Use it to continue to ${channel}. If you did not request this code, you can ignore this email.`,
            html: `<p>Your Italus verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. Use it to continue to ${channel}.</p><p>If you did not request this code, you can ignore this email.</p>`
          })
        });
        if (!response.ok) throw new Error('Community verification email could not be sent.');
        let body;
        try { body = await response.json(); } catch { throw new Error('Community email provider returned an invalid response.'); }
        if (!body?.id) throw new Error('Community email provider returned an invalid response.');
        return { id: body.id };
      } catch (error) {
        if (error?.name === 'AbortError') throw new Error('Community verification email timed out.');
        if (/^Community /.test(error?.message ?? '')) throw error;
        throw new Error('Community verification email could not be sent.');
      } finally { clearTimeout(timeout); }
    }
  };
}
