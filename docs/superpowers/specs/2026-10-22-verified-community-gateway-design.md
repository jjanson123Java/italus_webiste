# Verified Italus Community Gateway Design

## Intent

Replace direct Beehiiv links on `community.html` with a verified Italus gateway that presents the versioned community disclosure, proves control of an email address with a one-time code, records immutable acceptance evidence in Neon, and redirects only to an allowlisted Beehiiv community destination.

The gateway protects authors and gives Italus a defensible record of what was accepted without coupling community access to newsletter marketing consent. It does not claim to control direct Beehiiv URLs or Beehiiv's separate authentication and enforcement decisions.

## Canonical Disclosure

- The development-team review copy and version 1.0 canonical text is `docs/community-gateway-disclosure.md`.
- Normalize CRLF to LF before computing its SHA-256 hash.
- The production UI, acceptance statement, version, and stored hash must derive from the versioned disclosure and be protected by tests against drift.
- Version 1.0 takes effect October 22, 2026.
- Any material change creates a new version and requires renewed verified acceptance.
- Counsel review remains a launch recommendation, not a claim that automated implementation supplies legal advice.

## Admission Policy

- Any person who controls a valid email address may use the gateway.
- Active Writer's Block or Beehiiv subscription is not required.
- Community verification does not grant marketing consent, subscribe an address, reactivate a Beehiiv subscriber, or alter `waitlist_entries`.
- The user must confirm they are at least 18.
- Beehiiv may separately require authentication or membership after redirect.

## User Experience

1. `community.html` continues to show the existing branded hero and four discussion cards.
2. Direct external anchors become gateway controls identified by an internal channel slug. The Beehiiv URL is not accepted from the browser.
3. Selecting a destination opens an accessible modal headed `Before you enter the Italus Community`.
4. The modal displays the complete disclosure, version, effective date, and links to Beehiiv policies and Italus contact information.
5. The user enters an email address and requests a six-digit code.
6. Italus always returns a generic response so the endpoint does not reveal whether the address has been seen before.
7. The user enters the code and checks an initially unchecked acceptance statement confirming age, disclosure version, third-party hosting, conduct rules, and recording of acceptance.
8. `Agree and continue to <destination>` remains disabled until the code is present and the checkbox is checked.
9. Successful verification consumes the challenge, records acceptance, creates a trusted-browser session, sets a secure cookie, and returns an allowlisted redirect.
10. The secondary action closes the modal and keeps the user on Italus.

The modal must trap focus, restore focus to the originating card when closed, support keyboard operation, expose errors through an `aria-live` region, and honor reduced-motion preferences.

## Acceptance and Browser Trust

- Acceptance applies to one exact disclosure version until materially revised or access is revoked.
- A browser session is trusted for 30 days.
- The cookie is opaque, `HttpOnly`, `Secure`, `SameSite=Lax`, scoped to `/`, and has a 30-day `Max-Age`.
- Store only a SHA-256 or HMAC digest of the session token in Neon.
- A new browser, private window, cleared cookie, expired session, or changed terms version requires email verification.
- Re-verification for an unchanged version records an access event and refreshes browser trust; it does not overwrite or fabricate a new initial acceptance.
- Every access request checks current access status. A trusted cookie never bypasses a suspension or block.

## Email OTP Challenge

- Generate a cryptographically random six-digit code.
- Expire it after 10 minutes.
- Permit at most five failed attempts.
- Enforce a 60-second resend cooldown and rate limits per privacy-preserving request fingerprint and normalized email.
- Bind the challenge to normalized email, current terms version/hash, requested channel slug, and creation time.
- Store an HMAC digest of the code using a dedicated secret; never store or log the plaintext code.
- Invalidate the challenge immediately after successful verification.
- Generic public responses must not disclose whether an email or acceptance already exists.
- Logs must not contain codes, raw session tokens, complete email addresses, or provider API keys.

## Transactional Email

- Use Resend for Italus transactional verification messages, independently from Beehiiv newsletter delivery.
- Preferred sender: `Italus Community <access@community.italusbooks.com>`.
- Configure a durable reply/appeal address before production enforcement; do not rely on an unmonitored sender.
- Configure the Resend domain through Vercel/DNS and store `RESEND_API_KEY` only in Vercel environment variables.
- Verification email copy states the code, ten-minute expiration, requested Italus channel, and instructions to ignore the message if not requested.
- A delivery failure leaves no trusted session or acceptance and returns a safe retry message without exposing provider details.

## Redirect Policy

Server code owns the exact mapping:

- `community` -> `https://writers-block.beehiiv.com/community`
- `writers-room` -> `https://writers-block.beehiiv.com/community/channels/writer-s-room`
- `italus-bookshelf` -> `https://writers-block.beehiiv.com/community/channels/italus-bookshelf`
- `manuscript-lab` -> `https://writers-block.beehiiv.com/community/channels/manuscript-lab`
- `worlds-characters` -> `https://writers-block.beehiiv.com/community/channels/worlds-characters`

The API accepts only a slug. It never reflects or redirects to a caller-supplied URL. Redirect authorization is short-lived and single-purpose. Same-tab navigation is preferred to avoid popup blockers.

## Neon Data Model

Use a separate `italus_community` schema so marketing and community consent remain independent.

### `terms_versions`

- `version TEXT PRIMARY KEY`
- `effective_at TIMESTAMPTZ NOT NULL`
- `document_sha256 TEXT NOT NULL`
- `document_path TEXT NOT NULL`
- `is_current BOOLEAN NOT NULL DEFAULT FALSE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Enforce one current version through a partial unique index.

### `terms_acceptances`

- `id BIGSERIAL PRIMARY KEY`
- `email TEXT NOT NULL`
- `terms_version TEXT NOT NULL REFERENCES terms_versions(version)`
- `document_sha256 TEXT NOT NULL`
- `accepted_at TIMESTAMPTZ NOT NULL`
- `email_verified_at TIMESTAMPTZ NOT NULL`
- `acceptance_method TEXT NOT NULL CHECK (acceptance_method = 'email_otp')`
- `destination_channel TEXT NOT NULL`
- `request_fingerprint TEXT NOT NULL`
- `user_agent_hash TEXT`
- `locale TEXT`
- `supersedes_acceptance_id BIGINT REFERENCES terms_acceptances(id)`

Acceptance rows are append-only. The runtime role receives `SELECT` and `INSERT`, not `UPDATE` or `DELETE`.

### `email_challenges`

- Opaque public challenge ID, normalized email, code digest, bound terms version/hash and channel, expiration, resend time, failed-attempt count, consumed timestamp, request fingerprint, and created timestamp.
- Runtime may select, insert, update, and delete.
- Expired or consumed rows are operational data, not acceptance evidence.

### `browser_sessions`

- Token digest, normalized email, accepted terms version, creation, last verification, expiration, and revocation timestamp.
- Runtime may select, insert, update, and delete.

### `access_status`

- One row per normalized email with `active`, `suspended`, or `blocked`, reason, changed timestamp, and optional expiration.
- Missing status means active.
- Public runtime reads status. Administrative changes require the existing authenticated administrator path or a separately privileged operation.

### `access_events`

- Append-only event type, normalized email, terms version, channel, timestamp, and privacy-preserving request/user-agent fingerprints.
- Events distinguish initial acceptance, re-verification, trusted-session access, denial, and logout/revocation without duplicating legal acceptance.

## API Boundaries

- `POST /api/community-access-start`: validate origin/content type/body/email/channel/current terms; rate-limit; create or replace a safe challenge; send OTP.
- `POST /api/community-access-verify`: validate code and explicit boolean acceptance; atomically consume challenge, insert acceptance when required, create session, record event, set cookie, and return allowlisted destination.
- `POST /api/community-access`: validate trusted cookie, current terms version, channel, expiration, and access status; record event and return allowlisted destination or `verification_required`.
- `POST /api/community-access-logout`: revoke the current browser session and clear the cookie.
- `GET /api/community-cleanup`: require Vercel `CRON_SECRET`; delete expired/consumed challenges older than 24 hours and expired/revoked sessions according to operational retention.

All public endpoints use no-store responses, strict body limits, exact JSON validation, approved Italus/Vercel origins, safe headers, and generic errors. Verification is transactional so acceptance cannot be recorded without a consumed challenge and issued session.

### Fixed Abuse-Control Values

- Start verification: no more than five accepted requests per normalized email per hour and 20 per request fingerprint per hour.
- Resend: at least 60 seconds after the previous code; a resend invalidates all older active challenges for that email.
- Active challenge scope: one per normalized email, bound to one selected channel and the current terms version/hash.
- Verify: five wrong codes consume the challenge; additionally permit no more than 30 verification submissions per request fingerprint per hour.
- Trusted access: permit no more than 120 gateway access requests per request fingerprint per hour.
- Use the Vercel-provided first client address from `x-forwarded-for`, falling back to the socket address, normalize it, and store only a dedicated-secret HMAC fingerprint. Reuse the existing request-IP parsing pattern but not its secret.
- A successful API response may return the server-allowlisted Beehiiv destination directly. A separate redirect token does not add meaningful control over a public Beehiiv URL and is out of scope.

## Cleanup and Retention

- Successful challenges are consumed immediately.
- Public requests opportunistically remove expired challenge data older than 24 hours.
- A secured Vercel Cron job runs once daily for deterministic cleanup.
- Acceptance records are retained for six years after the later of the last community access or closure of a related dispute, unless a longer period is legally required.
- Access-event records are retained for 12 months.
- Expired or revoked browser-session rows are removed 30 days after expiration or revocation.
- Retention is documented in `privacy.html`; counsel should review the periods before public launch.
- Vercel stores secrets and invokes functions; email-verification state lives in Neon, not Vercel's filesystem.

## Administration

Extend `/admin-waitlist` without merging community consent into marketing consent. Add a separate read-only community section showing normalized email, current access status, latest accepted version/date, and latest verification/access event. CSV export keeps community and marketing columns distinct.

Administrative suspension, blocking, reactivation, expiry, enforcement-notice delivery, appeal tracking, and session-revocation controls are not part of this release. Beehiiv remains the operational moderation surface. The `access_status` table is created for enforcement readiness, but changes require an administrative Neon operation until a separately reviewed control surface is implemented.

Administrative display does not expose OTP digests, session-token digests, raw request fingerprints, or other security secrets.

## Security and Privacy Constraints

- Normalize email consistently with the existing waitlist code.
- Use separate secrets for IP/request fingerprinting, OTP hashing, and session-token hashing.
- Compare secret-derived values with timing-safe operations where practical.
- Never log raw codes, tokens, database URLs, Resend keys, or complete acceptance payloads.
- Do not use localStorage as evidence or browser trust.
- Do not reuse marketing consent as community acceptance.
- Do not permit arbitrary redirects.
- Do not let a cookie bypass current terms, expiration, or access status.
- Do not claim the Italus gateway prevents direct navigation to a known Beehiiv URL.

## Privacy Notice

- Create `privacy.html` and link it from the disclosure and site footer.
- Disclose waitlist/marketing data separately from community verification and acceptance data.
- Identify Neon as database infrastructure, Vercel as hosting/function infrastructure, Resend as transactional-email provider, and Beehiiv as the third-party community/newsletter platform.
- State the fixed operational and evidence retention periods from this design.
- Explain verification, trusted-browser cookies, community access records, privacy requests, and the fact that marketing consent is separate.
- Label the notice for counsel review; do not claim that the implementation itself supplies legal approval.

## Environment and Release Configuration

Add documented variables without committing values:

- `COMMUNITY_OTP_SECRET`
- `COMMUNITY_SESSION_SECRET`
- `COMMUNITY_REQUEST_HASH_SECRET`
- `RESEND_API_KEY`
- `COMMUNITY_EMAIL_FROM`
- `COMMUNITY_EMAIL_REPLY_TO`
- `CRON_SECRET`

Release order:

1. Confirm disclosure version 1.0, effective October 22, 2026, and complete development/counsel review.
2. Provision monitored sender/reply routing and authenticate the Resend sending domain.
3. Add Vercel environment variables.
4. Run the Neon migration with the administrative database role.
5. Deploy preview and verify email, cookie, acceptance, session reuse, changed-version behavior, denials, and every channel mapping.
6. Deploy production, verify the canonical disclosure/hash and cron registration, then push/confirm the intended Git revision.

## Verification

- Unit tests cover normalization, exact validation, code/session hashing, expiry, attempts, generic responses, terms-version binding, cookie flags, and channel allowlisting.
- Store tests cover append-only acceptance, atomic verification, current-version checks, status denial, session reuse, and cleanup boundaries.
- API tests cover origin/content type/body limits, send failure, incorrect/expired code, replay, changed terms, rate limiting, safe errors, cookie issuance, and no open redirect.
- Browser/static tests cover modal accessibility, initially disabled acceptance, all five gateway entry points, no direct Beehiiv anchors, successful/failed transitions, and logout.
- Migration tests verify least-privilege grants, constraints, indexes, and no acceptance update/delete grant.
- Full existing suite remains green.
- Production verification uses a designated test address and confirms Neon evidence without exposing secrets.

## Explicit Non-Goals

- Replacing Beehiiv authentication or moderation.
- Guaranteeing that a person cannot reach a publicly known Beehiiv URL directly.
- Automatically subscribing or reactivating newsletter marketing.
- Deciding legal ownership of disputed creative material.
- Treating this technical design as legal advice.

