# Consent-Safe Newsletter Resubscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize Beehiiv unsubscribes into Neon and allow only an explicit checked Italus form submission to start a fresh double-opt-in resubscription.

**Architecture:** A signed server-to-server webhook updates Neon to an `unsubscribed` state. The existing waitlist transaction detects that state and emits a one-time reactivation instruction that the Beehiiv client converts to `reactivate_existing: true`, while retaining Beehiiv double opt-in.

**Tech Stack:** Node.js ESM, Vercel Functions, Neon PostgreSQL, Beehiiv API, Svix webhook verification, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-21-consent-safe-resubscription-design.md`

## Global Constraints

- Never reactivate an address without a checked marketing-consent submission.
- Every reactivation must retain `double_opt_override: "on"` and require fresh confirmation.
- Verify the raw webhook body before JSON parsing or database mutation.
- Never log email addresses, bodies, secrets, or provider error details.
- Preserve one Neon row per normalized email and make repeated events/submissions idempotent.
- Do not alter the approved public form copy or Beehiiv welcome-email design.

## Review Focus

- A forged or stale webhook must not update Neon.
- A delayed unsubscribe event must not overwrite newer explicit consent.
- Two concurrent checked resubmissions must produce one Beehiiv reactivation request.
- A normal first-time subscription must never set `reactivate_existing: true`.
- A repeated webhook or unrelated verified event must be safely acknowledged without duplicate state changes.

---

### Task 1: Persist unsubscribe and explicit resubscription transitions

**Files:**
- Modify: `scripts/migrate-waitlist.mjs`
- Modify: `lib/waitlist-db.mjs`
- Test: `tests/waitlist-migration.test.mjs`
- Test: `tests/waitlist-db.test.mjs`

**Interfaces:**
- Produces: `markBeehiivUnsubscribed(email, occurredAt)` and an `upsertEntry` result with `reactivateExisting: boolean`.
- Consumes: normalized email and verified Beehiiv event timestamp.

- [ ] Add failing migration and store tests for the `unsubscribed` status, unsubscribe timestamp, stale-event protection, and one-time explicit resubscription transition.
- [ ] Run the focused tests and confirm they fail for the missing schema/state behavior.
- [ ] Add the additive migration statements and minimal store transitions.
- [ ] Run the focused tests and complete the task with a green full suite.

### Task 2: Send consent-safe Beehiiv reactivation requests

**Files:**
- Modify: `lib/beehiiv.mjs`
- Modify: `api/waitlist.mjs`
- Test: `tests/beehiiv.test.mjs`
- Test: `tests/waitlist-api.test.mjs`

**Interfaces:**
- Consumes: `reactivateExisting: boolean` from `upsertEntry`.
- Produces: Beehiiv create-subscription payload with conditional `reactivate_existing` and unconditional fresh double opt-in.

- [ ] Add failing tests proving only the explicit resubscription branch sends `reactivate_existing: true` and all branches retain double opt-in.
- [ ] Run the focused tests and confirm the expected payload/forwarding failures.
- [ ] Pass the transition flag through the waitlist handler and Beehiiv client.
- [ ] Run focused tests and the full suite.

### Task 3: Receive and verify Beehiiv unsubscribe webhooks

**Files:**
- Create: `lib/beehiiv-webhook.mjs`
- Create: `api/beehiiv-webhook.mjs`
- Create: `tests/beehiiv-webhook.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: raw request bytes, Svix headers, `BEEHIIV_WEBHOOK_SECRET`, and `markBeehiivUnsubscribed(email, occurredAt)`.
- Produces: authenticated idempotent handling of `subscription.deleted` with sanitized responses/logging.

- [ ] Install the official `svix` verifier and add failing endpoint tests for valid, invalid, stale, malformed, duplicate, and unrelated events.
- [ ] Run the focused test and confirm the endpoint/module is missing.
- [ ] Implement raw-body collection, signature verification, payload validation, event filtering, and database update.
- [ ] Run focused tests and the full suite.

### Task 4: Document, migrate, deploy, and verify

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: `BEEHIIV_WEBHOOK_SECRET`, production runtime/admin database URLs, GitHub/Vercel deployment.
- Produces: operator instructions and a deployable release.

- [ ] Document the Beehiiv Lite requirement, webhook URL/event, secret handling, migration, and end-to-end test flow.
- [ ] Run the full automated suite and inspect the diff for secret/PII leakage.
- [ ] Run the additive Neon migration with the administrative connection.
- [ ] Commit and push the verified change, confirm the Vercel production deployment, then configure and test the Beehiiv webhook with action-time approval for external settings.
