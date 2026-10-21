# Consent-Safe Newsletter Resubscription Design

## Goal

Allow an author who unsubscribed from Writer's Block in Beehiiv to explicitly resubscribe through an Italus waitlist form, while preserving consent history and requiring a fresh Beehiiv confirmation before newsletters resume.

## Consent and state rules

- Beehiiv remains the delivery authority; Neon remains the Italus consent and audit record.
- A verified Beehiiv `subscription.deleted` webhook changes the matching Neon entry to `unsubscribed`, records the unsubscribe time, and sets `marketing_opt_in` to false.
- An unchecked waitlist submission never subscribes, reactivates, or revokes a previously recorded Beehiiv state.
- A checked submission for an `unsubscribed` entry is an explicit resubscription request. It records a new `marketing_consent_at`, changes the state to `pending`, and calls Beehiiv with `reactivate_existing: true`.
- New subscriptions and ordinary retries keep `reactivate_existing: false`.
- Every subscription or resubscription uses `double_opt_override: "on"`; Beehiiv must send a fresh confirmation email before delivery resumes.
- Repeated checked submissions while a request is already `pending` or `synced` do not trigger additional Beehiiv calls.

## Webhook security and reliability

- The endpoint accepts only `POST` requests and a bounded raw request body.
- It verifies Beehiiv's Svix `svix-id`, `svix-timestamp`, and `svix-signature` headers using `BEEHIIV_WEBHOOK_SECRET` before parsing or writing data.
- Invalid signatures, stale timestamps, malformed JSON, and malformed unsubscribe payloads cause no database mutation.
- `subscription.deleted` changes consent state to unsubscribed. A verified `subscription.confirmed` event restores consent and synchronization state using the provider event time; unrelated verified events are acknowledged without mutation.
- Duplicate webhook delivery is idempotent. The same event cannot erase a newer explicit consent recorded after the event occurred.
- Logs contain event IDs and safe phases only; they do not contain email addresses, request bodies, secrets, or provider responses.

## Data model

Extend `beehiiv_sync_status` with `unsubscribed` and add `marketing_unsubscribed_at TIMESTAMPTZ`. The existing `marketing_consent_at` is overwritten only by a new explicit checked submission so it always reflects the latest grant of marketing consent.

## External configuration

- Add `BEEHIIV_WEBHOOK_SECRET` as a Vercel Production secret.
- Configure one Beehiiv webhook endpoint at `https://italusbooks.com/api/beehiiv-webhook` for `Subscription Deleted` and `Subscription Confirmed`.
- Beehiiv webhooks require a paid Lite plan or above. The code can be deployed before the plan is enabled, but Neon cannot learn about Beehiiv unsubscribes until the endpoint is configured and active.

## Verification

Automated tests must prove signature rejection, raw-body verification, event filtering, idempotent unsubscribe handling, stale-event protection, explicit reactivation, fresh double opt-in, and non-reactivation for ordinary submissions. Production verification uses a labeled test address through subscribe, confirm, unsubscribe, and checked resubscribe.
