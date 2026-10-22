# Verified Community Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require verified-email acceptance of the versioned Italus community disclosure before the website redirects a visitor to an allowlisted Beehiiv community destination.

**Architecture:** Static Italus controls open an accessible gateway modal. Vercel Functions send and verify Resend email OTPs, Neon stores short-lived challenges, 30-day trusted sessions, append-only evidence, and status, and the server alone maps internal channel slugs to Beehiiv URLs. A generated module binds the production UI and APIs to the reviewed Markdown version and SHA-256 hash.

**Tech Stack:** Static HTML/CSS/ES modules, Node.js Vercel Functions, `@neondatabase/serverless`, Resend HTTP API, Neon Postgres, Node test runner, Vercel Cron

**Spec:** `docs/superpowers/specs/2026-10-22-verified-community-gateway-design.md`

## Global Constraints

- Canonical disclosure: `docs/community-gateway-disclosure.md`, version `1.0`, effective October 22, 2026.
- Normalize disclosure line endings to LF before SHA-256 hashing.
- Any verified email may enter; do not require or alter newsletter/marketing status.
- OTP lasts 10 minutes, permits five wrong attempts, and has a 60-second resend cooldown.
- Trusted-browser session lasts 30 days and never bypasses current terms or access status.
- Beehiiv redirect URLs are server-owned allowlist values; never accept a caller-supplied URL.
- Acceptance evidence is append-only and separate from `italus_waitlist` marketing consent.
- Never store or log plaintext OTPs, raw session tokens, provider secrets, or raw client IP addresses.
- Preserve the pre-existing untracked `assets/writers-block-welcome-header.png` unless the user separately directs otherwise.
- Do not deploy until Resend sender/reply routing, Neon migration, environment variables, and preview end-to-end checks succeed.

## Review Focus

- Concurrent starts/resends must leave exactly one usable challenge per email and must not reset abuse limits.
- Terms changing between code issuance and verification must force a fresh start rather than record stale acceptance.
- A valid cookie for an expired, revoked, suspended, blocked, or previous-version session must never yield a redirect.
- Every public response must avoid email enumeration and every redirect path must reject unknown slugs or URLs.
- Partial provider/database failures must not record acceptance without a consumed challenge and valid session.

---

### Task 1: Canonical Disclosure Artifact and Drift Protection

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/generate-community-terms.mjs`
- Create: `js/community-terms.generated.mjs`
- Test: `tests/community-terms.test.mjs`
- Use: `docs/community-gateway-disclosure.md`

**Interfaces:**
- Produces: `COMMUNITY_TERMS` with `{ version, effectiveDate, documentSha256, html, acceptanceText }` for browser and server imports.
- Consumes: canonical Markdown from the approved spec.

- [ ] **Step 1: Write failing tests for LF-normalized hash, parsed version/effective date, acceptance text, safe external-link attributes, and `--check` drift detection**
- [ ] **Step 2: Run `node --test tests/community-terms.test.mjs` and verify failure because the generator/module do not exist**
- [ ] **Step 3: Add the minimal build-time Markdown renderer/generator and generated ES module; add `generate:community-terms` and `check:community-terms` scripts**
- [ ] **Step 4: Generate the module and run `node --test tests/community-terms.test.mjs` plus `npm run check:community-terms`**
- [ ] **Step 5: Commit the disclosure, spec, plan, generator, generated artifact, dependency lock, and tests**

### Task 2: Least-Privilege Community Schema and Store

**Files:**
- Create: `scripts/migrate-community.mjs`
- Create: `lib/community-db.mjs`
- Modify: `.env.example`
- Modify: `package.json`
- Test: `tests/community-migration.test.mjs`
- Test: `tests/community-db.test.mjs`

**Interfaces:**
- Produces: `createCommunityStore({ sql, now })` methods for rate limiting, challenge issuance/verification, trusted access, evidence listing, and cleanup.
- Consumes: `COMMUNITY_TERMS` version/hash and the existing Neon runtime/admin URL pattern.

- [ ] **Step 1: Write failing migration tests for all six tables, constraints/indexes, current-version seed, append-only grants, selective runtime permissions, and migration script validation**
- [ ] **Step 2: Run the migration tests and verify they fail because the migration is absent**
- [ ] **Step 3: Implement `migrate-community.mjs` and add `migrate:community` without weakening existing waitlist grants**
- [ ] **Step 4: Write failing store tests for one active challenge per email, resend invalidation, attempt consumption, atomic acceptance/session/event creation, same-version re-verification, status denial, session expiry/version checks, evidence listing, and retention cleanup boundaries**
- [ ] **Step 5: Run store tests and verify failure because `createCommunityStore` is absent**
- [ ] **Step 6: Implement the minimal Neon store using parameterized queries and `sql.transaction(...)` for successful verification**
- [ ] **Step 7: Run both focused suites and the existing full `npm test` suite**
- [ ] **Step 8: Commit schema, store, tests, environment names, and migration command**

### Task 3: Community Security Primitives and Transactional Mail

**Files:**
- Create: `lib/community-security.mjs`
- Create: `lib/community-mailer.mjs`
- Test: `tests/community-security.test.mjs`
- Test: `tests/community-mailer.test.mjs`

**Interfaces:**
- Produces: `normalizeCommunityEmail`, `validateChannelSlug`, `getCommunityDestination`, `createOtp`, `digestOtp`, `createSessionToken`, `digestSessionToken`, `createCommunityRequestFingerprint`, `serializeSessionCookie`, `clearSessionCookie`, and `createCommunityMailer`.
- Consumes: dedicated environment secrets and fixed channel mapping from the spec.

- [ ] **Step 1: Write failing security tests for validation, exact allowlist, random-code format, secret-bound digests, token entropy, cookie flags, expiration, request fingerprinting, and malformed cookies**
- [ ] **Step 2: Run security tests and verify failure because the module is absent**
- [ ] **Step 3: Implement minimal crypto/validation/cookie functions with Node `crypto`**
- [ ] **Step 4: Write failing mailer tests for Resend request shape, ten-minute/channel copy, reply-to, API rejection, malformed response, and secret-safe errors**
- [ ] **Step 5: Run mailer tests and verify failure because the mailer is absent**
- [ ] **Step 6: Implement the injected-fetch Resend client without logging recipient, code, or provider body**
- [ ] **Step 7: Run focused suites and full `npm test`**
- [ ] **Step 8: Commit security, mailer, and tests**

### Task 4: Start-Verification API

**Files:**
- Create: `api/community-access-start.mjs`
- Test: `tests/community-access-start.test.mjs`

**Interfaces:**
- Produces: `createCommunityAccessStartHandler({ store, mailer, env, now, logger })`.
- Consumes: Task 2 store and Task 3 validators/OTP/mailer.

- [ ] **Step 1: Write failing API tests for method/content type/body/origin, valid email/channel, generic success, per-email and per-fingerprint limits, cooldown, terms binding, challenge invalidation, mail failure, and safe logs**
- [ ] **Step 2: Run the focused test and verify failure because the handler is absent**
- [ ] **Step 3: Implement the handler with strict JSON/body limits, approved origins, privacy-preserving keys, and generic public responses**
- [ ] **Step 4: Run the focused suite and full `npm test`**
- [ ] **Step 5: Commit start API and tests**

### Task 5: Verification, Trusted Access, and Logout APIs

**Files:**
- Create: `api/community-access-verify.mjs`
- Create: `api/community-access.mjs`
- Create: `api/community-access-logout.mjs`
- Test: `tests/community-access-verify.test.mjs`
- Test: `tests/community-access.test.mjs`

**Interfaces:**
- Produces: injected handlers that issue/clear the `italus_community_session` cookie and return only server-allowlisted destinations.
- Consumes: Task 2 transactional store and Task 3 security primitives.

- [ ] **Step 1: Write failing verification tests for explicit boolean acceptance/age, wrong/expired/exhausted/replayed code, terms drift, atomic evidence/session creation, cookie flags, generic errors, and allowlisted result**
- [ ] **Step 2: Run verification tests and confirm the feature-missing failure**
- [ ] **Step 3: Implement verification with one transactional store operation and no acceptance on any failure**
- [ ] **Step 4: Write failing trusted-access/logout tests for missing/malformed/expired/revoked/old-version cookies, suspended/blocked status, rate limiting, successful reuse, event recording, cookie clearing, and unknown channel rejection**
- [ ] **Step 5: Run the tests and confirm the feature-missing failure**
- [ ] **Step 6: Implement trusted-access and logout handlers**
- [ ] **Step 7: Run focused suites and full `npm test`**
- [ ] **Step 8: Commit verification/access/logout APIs and tests**

### Task 6: Accessible Gateway UI and Privacy Notice

**Files:**
- Modify: `community.html`
- Create: `js/community-gateway.mjs`
- Modify: `js/site.mjs`
- Modify: `styles.css`
- Create: `privacy.html`
- Modify: all public HTML footers as needed
- Modify: `sitemap.xml`
- Test: `tests/community-browser.test.mjs`
- Modify: `tests/site.test.mjs`

**Interfaces:**
- Produces: five internal-slug gateway controls, accessible modal flow, privacy page, and safe API client functions.
- Consumes: Task 1 generated terms and Tasks 4-5 APIs.

- [ ] **Step 1: Write failing static/browser tests for no direct Beehiiv anchors, five slugs, complete generated terms, disabled agreement, email/code stages, generic state transitions, focus handling hooks, reduced motion, cancellation, trusted access, and privacy/footer/sitemap links**
- [ ] **Step 2: Run focused tests and confirm the expected missing-UI failures**
- [ ] **Step 3: Implement the modal markup, responsive Italus styling, separate gateway controller, and API calls without localStorage**
- [ ] **Step 4: Add the privacy notice with distinct marketing/community sections, providers, cookie purpose, fixed retention, and review notice**
- [ ] **Step 5: Run focused suites and full `npm test`**
- [ ] **Step 6: Preview desktop/mobile and keyboard flow locally; record only defects that require code changes**
- [ ] **Step 7: Commit UI, privacy, sitemap/footer, and tests**

### Task 7: Cleanup, Read-Only Administration, and Operations

**Files:**
- Create: `api/community-cleanup.mjs`
- Modify: `api/admin-waitlist.mjs`
- Modify: `vercel.json`
- Modify: `.env.example`
- Modify: `README.md`
- Test: `tests/community-cleanup.test.mjs`
- Modify: `tests/admin-waitlist.test.mjs`

**Interfaces:**
- Produces: authenticated daily cleanup and a separate community evidence table/CSV section for administrators.
- Consumes: Task 2 cleanup/evidence methods and fixed retention periods.

- [ ] **Step 1: Write failing cleanup tests for `CRON_SECRET`, method, expired challenge/session/event boundaries, legal acceptance retention, no-store response, and idempotency**
- [ ] **Step 2: Run cleanup tests and confirm the missing-handler failure**
- [ ] **Step 3: Implement the cleanup function and daily UTC Vercel Cron registration**
- [ ] **Step 4: Write failing admin tests for separated community display/export, latest version/date/status/event, escaping, and exclusion of digests/fingerprints**
- [ ] **Step 5: Run admin tests and confirm the missing-community-data failure**
- [ ] **Step 6: Extend the existing read-only Basic-auth administrator page without adding enforcement mutation controls**
- [ ] **Step 7: Document variables, migration, sender/DNS, retention, local generation, and deployment order**
- [ ] **Step 8: Run focused suites, `npm run check:community-terms`, and full `npm test`**
- [ ] **Step 9: Commit operations, admin evidence display, documentation, and tests**

### Task 8: External Configuration, Migration, Deployment, and End-to-End Verification

**Files:**
- External: Resend/Vercel integration and DNS records
- External: Vercel environment variables and Cron
- External: Neon production schema
- External: GitHub and Vercel production deployment

**Interfaces:**
- Consumes: all prior tasks.
- Produces: production verified gateway and captured verification evidence.

- [ ] **Step 1: Run `npm ci`, `npm run check:community-terms`, and `npm test`; inspect Git diff/status and preserve unrelated files**
- [ ] **Step 2: Provision Resend for the Vercel project, authenticate `community.italusbooks.com`, configure the monitored sender/reply path, and add the seven required environment variables without exposing values**
- [ ] **Step 3: Run `npm run migrate:community` with separate Neon admin/runtime URLs and verify tables, version/hash, indexes, and grants read-only**
- [ ] **Step 4: Deploy a Vercel preview and verify start email, wrong/expired code, successful acceptance, correct cookie, same-browser reuse, new-browser MFA, each channel, Neon evidence, admin display, and cleanup authorization**
- [ ] **Step 5: Commit any verified release corrections through TDD, rerun the entire suite, and push the feature branch**
- [ ] **Step 6: Deploy/promote production and verify `italusbooks.com/community.html`, `privacy.html`, canonical disclosure version/hash, sender delivery, all five allowlisted destinations, Vercel logs, and Cron registration**
- [ ] **Step 7: Push/confirm the final Git revision and record deployment URL, commit SHA, migration result, test count, and any remaining counsel/operations gate**

