# Secure Waitlist and Beehiiv Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace both preview-only waitlist forms with a secure, duplicate-safe Neon-backed waitlist, optional Beehiiv marketing consent, and a protected administrator list and CSV export.

**Architecture:** The existing static pages remain the browser client. Node.js Vercel Functions validate submissions and administer the list; Neon Postgres is authoritative for waitlist and consent records; Beehiiv receives only newly opted-in subscribers through its server-side API. Pure validation, escaping, authentication, and request orchestration are dependency-injected so Node's built-in test runner can verify behavior without production secrets or external calls.

**Tech Stack:** Vanilla HTML/CSS/ES modules, Node.js Vercel Functions, `@neondatabase/serverless`, Node `crypto`, Node built-in test runner, Beehiiv v2 subscriptions API.

**Spec:** `docs/superpowers/specs/2026-10-20-secure-waitlist-design.md`

## Global Constraints

- Preserve all existing site content, navigation, imagery, metadata, and social placeholders outside the waitlist controls.
- Normalize email addresses to trimmed lowercase and enforce one database row per normalized email with a unique constraint.
- Waitlist registration must succeed whether the optional marketing checkbox is checked or unchecked.
- Never send unchecked addresses to Beehiiv; never silently reactivate an unsubscribed Beehiiv subscriber.
- Keep database credentials, Beehiiv credentials, the administrator password, and the IP-hash secret server-only.
- Return the same public success response for new and existing addresses.
- Admin HTML and CSV must require authentication, disable caching and indexing, and escape untrusted values.
- Use test-driven development: every production behavior begins with a test that is observed failing for the expected reason.

## Review Focus

- Two simultaneous submissions of the same mixed-case email must leave one row and at most one newly requested Beehiiv synchronization.
- A repeat submission with an unchecked box must not revoke existing marketing consent or trigger a Beehiiv call.
- A previously failed Beehiiv sync must be visible to the administrator without making the visitor's waitlist registration fail.
- Malformed Basic Authentication, unequal credential lengths, HTML payloads, and spreadsheet-formula CSV values must not leak data or execute content.
- Missing production configuration must fail closed with generic public errors and useful server logs that do not contain secrets.

---

### Task 1: Server-side validation and output safety

**Files:**
- Create: `lib/waitlist-security.mjs`
- Create: `tests/waitlist-security.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `normalizeEmail(value) -> string`, `validateWaitlistPayload(value) -> { ok, data?, errors? }`, `createRequestKey(ip, secret) -> string`, `isAuthorizedBasicAuth(header, username, password) -> boolean`, `escapeHtml(value) -> string`, `escapeCsvCell(value) -> string`.

- [ ] **Step 1: Write failing tests for normalization and payload validation**

Cover trimmed lowercase email, valid optional `genre`, allowlisted `source` values `home` and `updates`, explicit Boolean `marketingOptIn`, honeypot normalization, invalid email, overlong name, unknown source/genre, and non-Boolean consent.

- [ ] **Step 2: Run `node --test tests/waitlist-security.test.mjs` and verify failure because the module does not exist**

- [ ] **Step 3: Implement the minimal validation and normalization exports**

- [ ] **Step 4: Run the focused test and verify the validation cases pass**

- [ ] **Step 5: Add failing tests for HMAC request keys, Basic Authentication, HTML escaping, and CSV formula neutralization**

Assert deterministic non-raw-IP request keys; valid credentials pass; missing, malformed, wrong, and unequal-length credentials fail; HTML special characters escape; CSV cells beginning with `=`, `+`, `-`, or `@` are prefixed safely.

- [ ] **Step 6: Run the focused test and verify the new cases fail for missing exports**

- [ ] **Step 7: Implement the security helpers with Node `crypto` timing-safe comparison and HMAC-SHA256**

- [ ] **Step 8: Change `package.json` test script to `node --test tests/*.test.mjs`, run `npm test`, and verify all tests pass**

- [ ] **Step 9: Commit with message `Add waitlist validation and security helpers`**

### Task 2: Neon schema and duplicate-safe data access

**Files:**
- Create: `lib/waitlist-db.mjs`
- Create: `tests/waitlist-db.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: normalized payloads from Task 1.
- Produces: `createWaitlistStore({ sql, now })` with `ensureSchema()`, `checkRateLimit(requestKey)`, `upsertEntry(data)`, `markBeehiivSynced(email, subscriptionId)`, `markBeehiivFailed(email)`, `listEntries()`, and `countEntries()`.
- `upsertEntry(data)` returns `{ entry, shouldSyncBeehiiv }`; `shouldSyncBeehiiv` is true only for a newly recorded explicit opt-in that is not already synced.

- [ ] **Step 1: Write failing store tests using an in-memory SQL adapter**

Cover idempotent schema initialization, one normalized email under repeated and concurrent calls, unchecked initial registration, unchecked repeat preserving prior opt-in, later checked repeat upgrading consent once, and first/last timestamps.

- [ ] **Step 2: Run `node --test tests/waitlist-db.test.mjs` and verify failure because the store does not exist**

- [ ] **Step 3: Install `@neondatabase/serverless` and implement the store with parameterized SQL and `ON CONFLICT (email)` semantics**

The production adapter reads `DATABASE_URL` lazily. Schema constraints limit `source` and `beehiiv_sync_status`; rate-limit cleanup and a five-attempt/15-minute rolling decision are performed server-side.

- [ ] **Step 4: Run the focused test and verify all persistence and concurrency cases pass**

- [ ] **Step 5: Add failing tests for rate-limit boundaries, sync status transitions, newest-first listing, and count**

- [ ] **Step 6: Implement the minimal missing store behavior and run `npm test`**

- [ ] **Step 7: Commit with message `Add duplicate-safe Neon waitlist store`**

### Task 3: Beehiiv subscriber client

**Files:**
- Create: `lib/beehiiv.mjs`
- Create: `tests/beehiiv.test.mjs`

**Interfaces:**
- Produces: `createBeehiivClient({ fetchImpl, apiKey, publicationId })` with `subscribe({ email, name, source }) -> { subscriptionId }`.
- The request uses `POST https://api.beehiiv.com/v2/publications/{publicationId}/subscriptions`, Bearer authentication, `reactivate_existing: false`, `double_opt_override: "on"`, `send_welcome_email: true`, and Italus source attribution.

- [ ] **Step 1: Write failing tests for request URL, headers, payload, successful ID extraction, timeout, non-2xx response, malformed response, and missing configuration**

- [ ] **Step 2: Run `node --test tests/beehiiv.test.mjs` and verify failure because the client does not exist**

- [ ] **Step 3: Implement the client with an abort timeout and sanitized errors that never include the API key**

- [ ] **Step 4: Run the focused test and then `npm test`; verify all tests pass**

- [ ] **Step 5: Commit with message `Add consent-safe Beehiiv subscriber client`**

### Task 4: Public waitlist Vercel Function

**Files:**
- Create: `api/waitlist.mjs`
- Create: `tests/waitlist-api.test.mjs`

**Interfaces:**
- Consumes: Task 1 validation and request keys, Task 2 store, Task 3 Beehiiv client.
- Produces: default Vercel handler and exported `createWaitlistHandler({ store, beehiiv, env, logger })` for tests.
- Public success body is `{ "ok": true, "message": "You're on the Italus waitlist." }` for new entries, duplicates, and honeypots.

- [ ] **Step 1: Write failing handler tests for method, content type, body size, origin, validation, honeypot, rate limit, and generic success equivalence**

- [ ] **Step 2: Run `node --test tests/waitlist-api.test.mjs` and verify failure because the handler does not exist**

- [ ] **Step 3: Implement request validation, origin allowlisting for `https://italusbooks.com`, `https://www.italusbooks.com`, and Vercel preview hosts, restrictive headers, and database orchestration**

- [ ] **Step 4: Run the focused test and verify the request cases pass**

- [ ] **Step 5: Add failing tests proving unchecked entries never call Beehiiv, new opt-ins call once, repeat opt-ins do not call again, and Beehiiv failure records `failed` while returning waitlist success**

- [ ] **Step 6: Implement Beehiiv synchronization orchestration and sanitized server logging**

- [ ] **Step 7: Run `npm test` and verify all tests pass**

- [ ] **Step 8: Commit with message `Add production waitlist submission API`**

### Task 5: Public form consent and browser behavior

**Files:**
- Modify: `index.html`
- Modify: `updates.html`
- Modify: `js/site.mjs`
- Modify: `styles.css`
- Modify: `tests/site.test.mjs`
- Create: `tests/waitlist-browser.test.mjs`

**Interfaces:**
- Consumes: `POST /api/waitlist` from Task 4.
- Produces: `serializeWaitlistForm(form) -> payload`, `submitWaitlist(payload, fetchImpl) -> result`, and browser form state transitions.

- [ ] **Step 1: Replace the preview-form test with failing markup tests for both forms**

Assert a source field, hidden honeypot, optional unchecked `marketingOptIn` checkbox, exact consent label from the spec, and production-ready status copy on both pages.

- [ ] **Step 2: Run `node --test tests/site.test.mjs` and verify failure against the current preview markup**

- [ ] **Step 3: Update both forms and minimal styles without changing unrelated visual content**

- [ ] **Step 4: Run the site test and verify the markup cases pass**

- [ ] **Step 5: Write failing browser-module tests for payload serialization, busy state, success reset, validation focus, rate-limit message, and network retry preserving values**

- [ ] **Step 6: Run `node --test tests/waitlist-browser.test.mjs` and verify failure for missing production submission behavior**

- [ ] **Step 7: Implement asynchronous waitlist submission while retaining preview behavior for access and contact forms**

- [ ] **Step 8: Run `npm test` and verify all tests pass**

- [ ] **Step 9: Commit with message `Connect waitlist forms with optional email consent`**

### Task 6: Protected administrator page and CSV export

**Files:**
- Create: `api/admin-waitlist.mjs`
- Create: `tests/admin-waitlist.test.mjs`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: Task 1 authentication/escaping and Task 2 list/count operations.
- Produces: default Vercel handler and exported `createAdminWaitlistHandler({ store, env })`; `/admin-waitlist` rewrite; `?format=csv` export.

- [ ] **Step 1: Write failing tests for missing, malformed, wrong, and correct Basic Authentication and confirm unauthorized bodies contain no waitlist data**

- [ ] **Step 2: Run `node --test tests/admin-waitlist.test.mjs` and verify failure because the handler does not exist**

- [ ] **Step 3: Implement fail-closed Basic Authentication with `WWW-Authenticate`, `Cache-Control: private, no-store`, CSP, frame denial, and noindex headers**

- [ ] **Step 4: Run the focused test and verify authentication cases pass**

- [ ] **Step 5: Add failing tests for count, newest-first rows, marketing and Beehiiv states, escaped HTML, protected CSV, CSV formula neutralization, and missing admin configuration**

- [ ] **Step 6: Implement the accessible server-rendered table and CSV response**

- [ ] **Step 7: Add the `/admin-waitlist` rewrite to `vercel.json`; run `npm test`**

- [ ] **Step 8: Commit with message `Add protected waitlist administration`**

### Task 7: Configuration, documentation, deployment, and end-to-end verification

**Files:**
- Create: `.env.example`
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-10-20-secure-waitlist-design.md`

**Interfaces:**
- Consumes: all prior tasks and Vercel Production variables `DATABASE_URL`, `WAITLIST_ADMIN_PASSWORD`, `WAITLIST_IP_HASH_SECRET`, `BEEHIIV_API_KEY`, and `BEEHIIV_PUBLICATION_ID`.
- Produces: deployable GitHub main branch and verified production flow.

- [ ] **Step 1: Write failing configuration/documentation assertions in `tests/site.test.mjs`**

Assert `.env.example` contains names without values, local secret files are ignored, README documents Neon, Beehiiv, admin access, password rotation, and deployment verification, and public sitemap/navigation omit the admin route.

- [ ] **Step 2: Run the focused test and verify failure for the missing configuration files and instructions**

- [ ] **Step 3: Add `.env.example`, ignore rules, README instructions, and mark the design status implemented only after production verification**

- [ ] **Step 4: Run `npm test` and verify the complete suite passes with no warnings**

- [ ] **Step 5: Provision or connect Neon to the existing `like-tac/italus-website` project and add generated production secrets without displaying their values**

- [ ] **Step 6: Commit with message `Document secure waitlist deployment` and push the reviewed commits to GitHub `main`**

- [ ] **Step 7: Verify the Vercel production deployment is `READY` and inspect logs for secret-free runtime errors**

- [ ] **Step 8: Verify production end-to-end**

Confirm unauthorized admin access returns `401`; unchecked and checked test submissions both succeed; duplicate checked submission leaves one Neon row; unchecked entry is absent from Beehiiv; checked entry is pending or active in Beehiiv; admin HTML and CSV show the correct consent/sync state; existing public pages and `italusbooks.com` remain healthy.

- [ ] **Step 9: Remove the clearly labeled production test entries through a safe targeted operation, rotate the previously shared administrator password, and record final verification evidence**
