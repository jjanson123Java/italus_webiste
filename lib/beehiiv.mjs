const API_ORIGIN = 'https://api.beehiiv.com';

export function createBeehiivClient({
  fetchImpl = fetch,
  apiKey = process.env.BEEHIIV_API_KEY,
  publicationId = process.env.BEEHIIV_PUBLICATION_ID,
  timeoutMs = 5000
} = {}) {
  if (!apiKey || !publicationId) throw new Error('Beehiiv is not configured.');

  return {
    async subscribe({ email, name, source, reactivateExisting = false }) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error('Beehiiv request timed out.')), timeoutMs);

      try {
        const response = await fetchImpl(
          `${API_ORIGIN}/v2/publications/${encodeURIComponent(publicationId)}/subscriptions`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${apiKey}`,
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              email,
              reactivate_existing: reactivateExisting === true,
              double_opt_override: 'on',
              send_welcome_email: true,
              utm_source: `italus_${source}`,
              utm_medium: 'website',
              utm_campaign: 'waitlist',
              custom_fields: [{ name: 'name', value: name }]
            }),
            signal: controller.signal
          }
        );

        if (!response.ok) throw new Error('Beehiiv subscription could not be completed.');

        let payload;
        try {
          payload = await response.json();
        } catch {
          throw new Error('Beehiiv returned an invalid response.');
        }
        const subscriptionId = payload?.data?.id;
        if (typeof subscriptionId !== 'string' || !subscriptionId) {
          throw new Error('Beehiiv returned an invalid response.');
        }
        return { subscriptionId };
      } catch (error) {
        if (controller.signal.aborted) throw new Error('Beehiiv request timed out.');
        if (/invalid response|could not be completed/.test(error?.message ?? '')) throw error;
        throw new Error('Beehiiv subscription could not be completed.');
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
