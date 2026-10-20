# Italus Secure Waitlist Design

**Date:** October 20, 2026  
**Status:** Revised design awaiting final review

## Purpose

Replace the current preview-only waitlist behavior with a production flow that securely stores author sign-ups and gives the Italus administrator a protected way to review and export them. Keep waitlist registration separate from optional promotional-email consent, and synchronize only explicitly opted-in addresses to beehiiv. Preserve the existing visual design and all unrelated website behavior.

## Scope

This work covers the two existing waitlist forms, a server-side submission API, durable storage, abuse controls, a protected administrator view, and a beehiiv subscriber integration for people who explicitly opt in to release, sales, and blog emails. It does not add public user accounts, paid subscriptions, or a general-purpose content-management system. Campaign authoring and sending will occur in beehiiv rather than in the Italus website.

## Architecture

The static HTML/CSS/JavaScript website will remain intact. Small Node.js Vercel Functions will add server-side behavior. A Vercel Marketplace Neon Postgres database will provide durable relational storage through the `@neondatabase/serverless` driver. beehiiv is not currently offered as a native Vercel Marketplace integration, so the server-side function will connect directly to beehiiv's subscriptions API using a secret API key and publication ID stored in Vercel.

The production request flow is:

1. A visitor completes an existing waitlist form. An optional, unchecked-by-default checkbox lets the visitor separately consent to Italus application-release, sales, and blog emails.
2. Browser JavaScript submits JSON to `POST /api/waitlist` over HTTPS.
3. The function validates and normalizes the payload, checks anti-abuse controls, and inserts or safely updates the single entry identified by normalized email address.
4. If that visitor has newly and explicitly opted into email, the function subscribes the address to the Italus beehiiv publication. Unchecked submissions are never sent to beehiiv.
5. The function returns the same success response for new and existing addresses so the endpoint does not reveal whether an email is already registered.
6. The administrator opens `/admin-waitlist`, enters HTTP Basic Authentication credentials, and receives a server-rendered list or CSV export.

## Data Model

### `waitlist_entries`

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | `bigserial` | Internal identifier |
| `email` | `text`, unique | Normalized lowercase email address |
| `name` | `text` | Trimmed author name |
| `genre` | `text`, nullable | Optional genre selected on the Updates page |
| `source` | `text` | Approved source identifier such as `home` or `updates` |
| `marketing_opt_in` | `boolean` | Whether the visitor explicitly requested promotional email |
| `marketing_consent_at` | `timestamptz`, nullable | First time explicit promotional consent was recorded |
| `beehiiv_subscription_id` | `text`, nullable | beehiiv subscriber identifier after successful synchronization |
| `beehiiv_sync_status` | `text` | `not_requested`, `pending`, `synced`, or `failed` |
| `beehiiv_synced_at` | `timestamptz`, nullable | Most recent successful beehiiv synchronization time |
| `created_at` | `timestamptz` | First successful registration time |
| `updated_at` | `timestamptz` | Most recent submission time |

An email address is the unique identity for this waitlist. A database unique constraint on normalized lowercase email guarantees that only one row can exist for an address, including concurrent or repeated submissions. A repeat submission may update name, genre, source, and `updated_at`, but never creates a duplicate row.

Marketing consent is independent of waitlist membership. A first submission with the box unchecked creates the waitlist row with `marketing_opt_in = false`, `marketing_consent_at = null`, and `beehiiv_sync_status = not_requested`. If the same person later submits again with the box checked, the existing row is upgraded to opted in, the consent time is recorded, and beehiiv synchronization begins. A later unchecked repeat submission does not silently revoke previously granted consent because an omitted checkbox on a repeated form is not a reliable unsubscribe action. Once subscribed, the recipient opts out using the preferences or unsubscribe link beehiiv places in every campaign email. The integration never uses beehiiv's `reactivate_existing` option, so a previously unsubscribed person is not silently resubscribed.

No raw IP address, browser fingerprint, password, or unnecessary profile data is stored with an entry.

### `waitlist_rate_limits`

| Column | Type | Purpose |
| --- | --- | --- |
| `request_key` | `text` | HMAC-derived identifier; never a raw IP address |
| `attempted_at` | `timestamptz` | Time of an attempted submission |

The API permits at most five attempts per derived request key in a rolling 15-minute window. Old rate-limit rows are periodically deleted. The HMAC key is a Vercel secret, so database contents cannot be used to reconstruct source addresses.

The schema is created idempotently with `CREATE TABLE IF NOT EXISTS` from a shared server-only database module. This keeps first deployment and disaster recovery deterministic without exposing database credentials to the browser.

## Public Form Behavior

Both current waitlist forms will retain their layout and branding. Each will gain:

- An optional checkbox, unchecked by default, labeled: “Email me Italus product releases, sales, and blog updates. I understand I can unsubscribe at any time.”
- A visually hidden honeypot field that normal visitors leave empty.
- A stable source value identifying the form location.
- Submission, success, validation-error, rate-limit, and retry states announced through the existing accessible live-status element.

The visitor may join the waitlist without checking the email-updates box. In that case Italus stores the waitlist entry but does not enroll the address in beehiiv or send promotional email. The browser will disable the submit button while a request is active and prevent accidental double submission. A successful response resets the form. Network or server failures leave the entered values in place so the visitor can retry.

## Submission API

`POST /api/waitlist` will:

- Accept only `application/json` requests from approved production and Vercel-hosted origins.
- Enforce a small request-body limit.
- Validate name length, normalize and validate email, allow only known genre/source values, and require the marketing preference to be an explicit boolean without requiring it to be `true`.
- Treat a filled honeypot as a generic success without writing data.
- Apply the database-backed rolling rate limit before writing an entry.
- Use parameterized SQL exclusively.
- Enforce one row per normalized email with a database unique constraint and conflict-safe SQL.
- Attempt beehiiv synchronization only when a new explicit opt-in is recorded.
- Return `200` with a generic success message for both inserts and updates.
- Return structured `400`, `429`, and `500` responses without exposing database or infrastructure details.
- Send `Cache-Control: no-store` and restrictive security headers.

Methods other than `POST` return `405 Method Not Allowed`.

## beehiiv Subscriber Integration

Neon remains the authoritative waitlist record. beehiiv is the separate, consent-filtered delivery audience for Italus product releases, sales, and blog updates.

For a newly opted-in address, the server calls `POST /v2/publications/{publicationId}/subscriptions` with server-side Bearer authentication. It passes the normalized email, source attribution, and the visitor's name as supported metadata. The request leaves `reactivate_existing` disabled and uses beehiiv's publication double-opt-in setting, or explicitly enables double opt-in, so the website cannot override a prior unsubscribe or bypass confirmation policy.

The database transaction records the waitlist entry and sets synchronization to `pending` before the external API call. A successful beehiiv response stores the subscriber identifier, `synced` status, and timestamp. A beehiiv timeout or error changes the status to `failed` without losing the waitlist registration or exposing the failure to the visitor. The protected administrator view surfaces pending and failed states so they can be retried safely after configuration or service issues are corrected.

Phase one does not import unchecked waitlist entries into beehiiv, bulk-enroll existing records, or send campaigns automatically. Campaign content and audience selection remain deliberate administrator actions in beehiiv.

## Administrator Access

`/admin-waitlist` will be rewritten to a Node.js Vercel Function. The function will require HTTP Basic Authentication for every request. The username is `admin`; the password is read only from the sensitive Vercel environment variable `WAITLIST_ADMIN_PASSWORD`.

Authentication comparison will use timing-safe byte comparison. Failed authentication returns `401` with `WWW-Authenticate` and no waitlist information. Successful HTML responses will show:

- Total entry count.
- Newest entries first.
- Name, email, genre, source, marketing opt-in state, consent time, beehiiv sync state, and first/last submission timestamps.
- A CSV export link protected by the same credentials.

HTML and CSV values will be escaped to prevent injection. Admin responses will use `Cache-Control: private, no-store`, a restrictive Content Security Policy, `X-Frame-Options: DENY`, and `X-Robots-Tag: noindex, nofollow`. The page and export will never be linked from public navigation or included in the sitemap.

## Secrets and Configuration

The following values will exist only as Vercel environment variables:

- `DATABASE_URL` — provisioned by the Neon Marketplace integration.
- `WAITLIST_ADMIN_PASSWORD` — the approved administrator password, configured as a sensitive variable.
- `WAITLIST_IP_HASH_SECRET` — a generated high-entropy HMAC secret, configured as a sensitive variable.
- `BEEHIIV_API_KEY` — a beehiiv API key with subscription-write access, configured as a sensitive variable.
- `BEEHIIV_PUBLICATION_ID` — the Italus beehiiv publication identifier.

No secret value will be committed, printed, embedded in client JavaScript, or written to documentation. `.env.example` will contain names only. Production and local-development values will be separated. Preview deployments will not receive production database or beehiiv access unless explicitly enabled later.

Because the initial administrator password was supplied through chat, it should be rotated after production verification.

## Privacy and Retention

The form will state the purpose of collection at the point of submission and will not bundle promotional consent with waitlist registration. The implementation will collect only information needed for the waitlist and consent audit. Entries remain private to the administrator. Rate-limit records are short-lived. beehiiv campaign emails provide recipient preference and unsubscribe controls. A privacy-policy update should define retention, deletion requests, and marketing-email practices before the first promotional campaign is sent.

## Files and Components

Expected implementation changes:

- `index.html` and `updates.html`: optional consent, honeypot, source fields, and production form messaging.
- `js/site.mjs`: asynchronous submission and accessible status behavior.
- `api/waitlist.mjs`: public submission endpoint.
- `api/admin-waitlist.mjs`: authenticated HTML and CSV administration endpoint.
- `lib/waitlist-db.mjs`: lazy Neon connection, schema creation, one-email uniqueness, rate limiting, and data access.
- `lib/beehiiv.mjs`: server-only beehiiv subscriber synchronization and response validation.
- `lib/waitlist-security.mjs`: validation, normalization, HMAC request keys, authentication, and escaping helpers.
- `vercel.json`: `/admin-waitlist` rewrite plus function-specific security headers where needed.
- `package.json` and lockfile: Neon serverless dependency and test scripts.
- `.env.example`: variable names without values.
- `tests/`: unit and API-level coverage.
- `README.md`: setup, environment, administration, beehiiv, deployment, and password-rotation instructions.

## Testing Strategy

Automated tests will cover:

- Email normalization and invalid input rejection.
- Optional consent boolean and allowed source/genre values.
- Honeypot behavior.
- Duplicate-email uniqueness under sequential and concurrent submissions.
- Unchecked submissions never calling beehiiv.
- A later explicit opt-in upgrading the existing row and calling beehiiv once.
- beehiiv success, timeout, failure-state recording, and no-reactivation behavior.
- Rolling rate-limit decisions.
- Successful and failed Basic Authentication.
- Timing-safe comparison behavior for differing input lengths.
- HTML escaping and CSV formula-injection protection.
- Browser form success, validation, retry, and busy states using mocked requests.
- Preservation of existing metadata, navigation, and imagery checks.

Production verification will confirm:

1. An unauthorized admin request receives `401` and no data.
2. A test waitlist submission succeeds through `italusbooks.com`.
3. The protected admin view shows the stored test entry.
4. Repeating the same email does not create a second row.
5. An unchecked submission is not present in beehiiv.
6. A checked submission synchronizes to beehiiv without creating a second Neon row.
7. CSV export includes the entry and opens only with valid credentials.
8. The public site still serves all existing pages and the custom domain remains secure.

The production test entry will be clearly labeled and removed after verification if a safe deletion path is available; otherwise it will be identified to the administrator for manual removal.

## Deployment

Provision Neon through the Vercel Marketplace for the existing `like-tac/italus-website` project. Create an Italus publication in beehiiv, complete beehiiv account verification, generate a dedicated API key, and copy the API V2 publication ID. Add sensitive secrets directly to Vercel, install dependencies locally, run the full test suite, commit and push to GitHub `main`, and allow the established Git integration to deploy production. Inspect build/runtime logs and verify the complete browser-to-database-to-admin-and-beehiiv flow before reporting completion.

## Success Criteria

- Real visitors can join the waitlist from either existing form.
- Valid entries persist across deployments and function instances.
- Duplicate email addresses do not create duplicate records.
- Waitlist registration succeeds whether or not promotional consent is granted.
- Unchecked addresses are never added to beehiiv or used for promotional mail.
- Explicitly opted-in addresses synchronize to beehiiv, retain auditable consent time, and can unsubscribe through beehiiv.
- Secrets and database credentials never reach GitHub or browser code.
- Unauthorized users cannot retrieve waitlist entries or CSV exports.
- The administrator can securely view and export the list.
- Existing site content and design remain unchanged except for the necessary waitlist controls and messaging.
