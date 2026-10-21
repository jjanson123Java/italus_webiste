# Italus Website

Public promotional website and future application entry point for Italus, an author-led AI narrative studio. The site includes a production waitlist, optional Beehiiv marketing consent, and a protected administrator view.

## Local preview and tests

Install dependencies and run the complete suite:

```powershell
npm install
npm test
python -m http.server 8766
```

Then open `http://127.0.0.1:8766/`. Static preview does not run the Vercel Functions; use `vercel dev` when testing the full local API with local environment variables.

## Secure waitlist configuration

Copy `.env.example` to `.env.local` only for local development. Never commit credentials. Generate long, independent values for the administrator password and IP-hash secret.

- `DATABASE_ADMIN_URL` is the Neon owner connection used only from a trusted local shell to run migrations. Never add it to Vercel.
- `DATABASE_URL` must belong to the restricted runtime role. It can read and write only the two tables in the `italus_waitlist` schema and cannot create schemas, roles, databases, or unrelated tables.
- `WAITLIST_ADMIN_USERNAME` defaults to `admin` if omitted, but should be set explicitly.
- `WAITLIST_ADMIN_PASSWORD` protects `/admin-waitlist`; rotate it after initial verification and whenever exposure is suspected.
- `WAITLIST_IP_HASH_SECRET` creates opaque abuse-control keys so raw visitor IP addresses are not stored.
- `BEEHIIV_API_KEY` and `BEEHIIV_PUBLICATION_ID` enable newsletter synchronization only for checked marketing consent.
- `BEEHIIV_WEBHOOK_SECRET` verifies signed Beehiiv unsubscribe notifications before Neon is changed. Store it as a Vercel Production Secret, never as public configuration.

Provision a dedicated Neon database and create a separate login/role for the runtime connection. With both database URLs available only in the local shell, apply the idempotent least-privilege schema:

```powershell
npm run migrate:waitlist
```

After migration, add only `DATABASE_URL`, `WAITLIST_ADMIN_USERNAME`, `WAITLIST_ADMIN_PASSWORD`, `WAITLIST_IP_HASH_SECRET`, `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID`, and `BEEHIIV_WEBHOOK_SECRET` to the Vercel Production environment. The Beehiiv API key and webhook secret must remain server-side.

The website requests double opt-in and never silently reactivates an unsubscribed address. A checked submission for an address that Neon knows is unsubscribed records a new consent date, requests Beehiiv reactivation, and sends a fresh confirmation email. An unchecked submission never reactivates newsletter delivery.

## Beehiiv unsubscribe webhook

Beehiiv publication webhooks require the Lite plan or higher. After the new code and database migration are deployed:

1. In Beehiiv, open **Settings → Webhooks** for the Writer's Block by Italus publication.
2. Create an endpoint for `https://italusbooks.com/api/beehiiv-webhook`.
3. Select only **Subscription Deleted** (`subscription.deleted`).
4. Copy the endpoint signing secret. Add it to the Italus Website Vercel project as the Production **Secret** `BEEHIIV_WEBHOOK_SECRET`; do not paste it into source code or chat.
5. Redeploy after adding the secret, then activate the Beehiiv endpoint.

The endpoint verifies Beehiiv's Svix signature and timestamp against the untouched request body, accepts only bounded `POST` requests, ignores unrelated signed events, and writes no email addresses or request bodies to logs. Neon records `unsubscribed` and `marketing_unsubscribed_at`; a delayed unsubscribe event cannot overwrite a newer explicit consent date.

## Administrator access

Open `https://italusbooks.com/admin-waitlist` and use the configured Basic Authentication credentials. The page is deliberately absent from navigation and the sitemap, but secrecy of the URL is not an access control. It returns private/no-store and noindex headers, escapes untrusted values, throttles failed logins, and protects CSV exports behind the same authentication.

Use a password manager and enable multi-factor authentication (MFA) on GitHub, Vercel, Neon, and Beehiiv. Limit team membership, review access regularly, and rotate the previously shared administrator password before inviting real users.

## Deployment and end-to-end verification

GitHub `main` deploys through the existing Vercel integration. Before launch:

1. Confirm tests pass and the production deployment is READY.
2. Keep `DATABASE_ADMIN_URL` out of Vercel and confirm the deployed `DATABASE_URL` is the restricted runtime role.
3. Stage Vercel Firewall rules for `POST /api/waitlist` and `/admin-waitlist` in log mode. Review matched traffic before enabling a blocking or rate-limiting action.
4. Confirm unauthenticated admin requests return `401` without data.
5. Submit one clearly labeled unchecked test address and one checked address; repeat the checked submission and verify only one database row exists.
6. Verify the unchecked address is absent from Beehiiv, the checked address is pending or active, and the admin HTML and CSV report the correct consent state.
7. Inspect Vercel runtime logs for sanitized errors and no secrets, then remove the labeled test rows with a targeted database operation.
8. Recheck the home page, updates page, domain TLS, and remaining public pages as the final end-to-end verification.

For the resubscription path, use a labeled test address and verify this order:

1. Submit a checked Italus form, confirm the Beehiiv opt-in email, and receive the welcome email.
2. Use Beehiiv's unsubscribe link and confirm the Neon administrator view changes to `Marketing: no` and `Beehiiv: unsubscribed` after webhook delivery.
3. Submit the same address with the marketing box unchecked and confirm no email is sent.
4. Submit it again with the marketing box checked and confirm Neon records a new consent time and Beehiiv sends a new confirmation email.
5. Confirm the email and verify delivery becomes active again. Remove only the labeled test record when testing is complete.

Official social URLs are still placeholders and should be replaced before promotional publishing. Pricing and feature claims should be reconfirmed against the application release.

Source repository: `https://github.com/jjanson123Java/italus_webiste`.
