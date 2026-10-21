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

Provision a dedicated Neon database and create a separate login/role for the runtime connection. With both database URLs available only in the local shell, apply the idempotent least-privilege schema:

```powershell
npm run migrate:waitlist
```

After migration, add only `DATABASE_URL`, `WAITLIST_ADMIN_USERNAME`, `WAITLIST_ADMIN_PASSWORD`, `WAITLIST_IP_HASH_SECRET`, `BEEHIIV_API_KEY`, and `BEEHIIV_PUBLICATION_ID` to the Vercel Production environment. The Beehiiv API key must remain server-side. The website requests double opt-in and never silently reactivates an unsubscribed address.

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

Official social URLs are still placeholders and should be replaced before promotional publishing. Pricing and feature claims should be reconfirmed against the application release.

Source repository: `https://github.com/jjanson123Java/italus_webiste`.
