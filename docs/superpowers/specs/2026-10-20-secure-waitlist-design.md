# Italus Secure Waitlist Design

**Date:** October 20, 2026  
**Status:** Approved for implementation planning

## Purpose

Replace the current preview-only waitlist behavior with a production flow that securely stores author sign-ups and gives the Italus administrator a protected way to review and export them. Preserve the existing visual design and all unrelated website behavior.

## Scope

This work covers the two existing waitlist forms, a server-side submission API, durable storage, abuse controls, and a protected administrator view. It does not add public user accounts, email campaigns, automated welcome messages, subscription billing, or a general-purpose content-management system.

## Architecture

The static HTML/CSS/JavaScript website will remain intact. Small Node.js Vercel Functions will add server-side behavior. A Vercel Marketplace Neon Postgres database will provide durable relational storage through the `@neondatabase/serverless` driver.

The production request flow is:

1. A visitor completes an existing waitlist form and explicitly consents to receiving Italus launch and early-access updates.
2. Browser JavaScript submits JSON to `POST /api/waitlist` over HTTPS.
3. The function validates and normalizes the payload, checks anti-abuse controls, and upserts the entry by normalized email address.
4. The function returns the same success response for new and existing addresses so the endpoint does not reveal whether an email is already registered.
5. The administrator opens `/admin-waitlist`, enters HTTP Basic Authentication credentials, and receives a server-rendered list or CSV export.

## Data Model

### `waitlist_entries`

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | `bigserial` | Internal identifier |
| `email` | `text`, unique | Normalized lowercase email address |
| `name` | `text` | Trimmed author name |
| `genre` | `text`, nullable | Optional genre selected on the Updates page |
| `source` | `text` | Approved source identifier such as `home` or `updates` |
| `consent_at` | `timestamptz` | Time the visitor explicitly consented |
| `created_at` | `timestamptz` | First successful registration time |
| `updated_at` | `timestamptz` | Most recent submission time |

An email address is the unique identity for this waitlist. A repeat submission updates name, genre, source, consent time, and `updated_at` without creating a duplicate row. No raw IP address, browser fingerprint, password, or unnecessary profile data is stored with an entry.

### `waitlist_rate_limits`

| Column | Type | Purpose |
| --- | --- | --- |
| `request_key` | `text` | HMAC-derived identifier; never a raw IP address |
| `attempted_at` | `timestamptz` | Time of an attempted submission |

The API permits at most five attempts per derived request key in a rolling 15-minute window. Old rate-limit rows are periodically deleted. The HMAC key is a Vercel secret, so database contents cannot be used to reconstruct source addresses.

The schema is created idempotently with `CREATE TABLE IF NOT EXISTS` from a shared server-only database module. This keeps first deployment and disaster recovery deterministic without exposing database credentials to the browser.

## Public Form Behavior

Both current waitlist forms will retain their layout and branding. Each will gain:

- A required consent checkbox with concise language explaining that Italus may send launch and early-access updates.
- A visually hidden honeypot field that normal visitors leave empty.
- A stable source value identifying the form location.
- Submission, success, validation-error, rate-limit, and retry states announced through the existing accessible live-status element.

The browser will disable the submit button while a request is active and prevent accidental double submission. A successful response resets the form. Network or server failures leave the entered values in place so the visitor can retry.

## Submission API

`POST /api/waitlist` will:

- Accept only `application/json` requests from approved production and Vercel-hosted origins.
- Enforce a small request-body limit.
- Validate name length, normalize and validate email, allow only known genre/source values, and require consent.
- Treat a filled honeypot as a generic success without writing data.
- Apply the database-backed rolling rate limit before writing an entry.
- Use parameterized SQL exclusively.
- Return `200` with a generic success message for both inserts and updates.
- Return structured `400`, `429`, and `500` responses without exposing database or infrastructure details.
- Send `Cache-Control: no-store` and restrictive security headers.

Methods other than `POST` return `405 Method Not Allowed`.

## Administrator Access

`/admin-waitlist` will be rewritten to a Node.js Vercel Function. The function will require HTTP Basic Authentication for every request. The username is `admin`; the password is read only from the sensitive Vercel environment variable `WAITLIST_ADMIN_PASSWORD`.

Authentication comparison will use timing-safe byte comparison. Failed authentication returns `401` with `WWW-Authenticate` and no waitlist information. Successful HTML responses will show:

- Total entry count.
- Newest entries first.
- Name, email, genre, source, consent time, and first/last submission timestamps.
- A CSV export link protected by the same credentials.

HTML and CSV values will be escaped to prevent injection. Admin responses will use `Cache-Control: private, no-store`, a restrictive Content Security Policy, `X-Frame-Options: DENY`, and `X-Robots-Tag: noindex, nofollow`. The page and export will never be linked from public navigation or included in the sitemap.

## Secrets and Configuration

The following values will exist only as Vercel environment variables:

- `DATABASE_URL` — provisioned by the Neon Marketplace integration.
- `WAITLIST_ADMIN_PASSWORD` — the approved administrator password, configured as a sensitive variable.
- `WAITLIST_IP_HASH_SECRET` — a generated high-entropy HMAC secret, configured as a sensitive variable.

No secret value will be committed, printed, embedded in client JavaScript, or written to documentation. `.env.example` will contain names only. Production and local-development values will be separated. Preview deployments will not receive production database access unless explicitly enabled later.

Because the initial administrator password was supplied through chat, it should be rotated after production verification.

## Privacy and Retention

The form will state the purpose of collection at the point of submission. The implementation will collect only information needed for the waitlist. Entries remain private to the administrator. Rate-limit records are short-lived. A later privacy-policy project should define retention, deletion requests, and marketing-email compliance before promotional email campaigns begin.

## Files and Components

Expected implementation changes:

- `index.html` and `updates.html`: consent, honeypot, source fields, and production form messaging.
- `js/site.mjs`: asynchronous submission and accessible status behavior.
- `api/waitlist.mjs`: public submission endpoint.
- `api/admin-waitlist.mjs`: authenticated HTML and CSV administration endpoint.
- `lib/waitlist-db.mjs`: lazy Neon connection, schema creation, rate limiting, and data access.
- `lib/waitlist-security.mjs`: validation, normalization, HMAC request keys, authentication, and escaping helpers.
- `vercel.json`: `/admin-waitlist` rewrite plus function-specific security headers where needed.
- `package.json` and lockfile: Neon serverless dependency and test scripts.
- `.env.example`: variable names without values.
- `tests/`: unit and API-level coverage.
- `README.md`: setup, environment, administration, deployment, and password-rotation instructions.

## Testing Strategy

Automated tests will cover:

- Email normalization and invalid input rejection.
- Required consent and allowed source/genre values.
- Honeypot behavior.
- Duplicate-email upsert semantics.
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
5. CSV export includes the entry and opens only with valid credentials.
6. The public site still serves all existing pages and the custom domain remains secure.

The production test entry will be clearly labeled and removed after verification if a safe deletion path is available; otherwise it will be identified to the administrator for manual removal.

## Deployment

Provision Neon through the Vercel Marketplace for the existing `like-tac/italus-website` project. Add sensitive secrets directly to Vercel, install dependencies locally, run the full test suite, commit and push to GitHub `main`, and allow the established Git integration to deploy production. Inspect build/runtime logs and verify the complete browser-to-database-to-admin flow before reporting completion.

## Success Criteria

- Real visitors can join the waitlist from either existing form.
- Valid entries persist across deployments and function instances.
- Duplicate email addresses do not create duplicate records.
- Secrets and database credentials never reach GitHub or browser code.
- Unauthorized users cannot retrieve waitlist entries or CSV exports.
- The administrator can securely view and export the list.
- Existing site content and design remain unchanged except for the necessary waitlist controls and messaging.
