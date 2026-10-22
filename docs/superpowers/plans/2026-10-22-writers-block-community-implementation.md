# Writer's Block Community and Newsletter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finalize the reusable Writer's Block newsletter, create its Beehiiv discussion community, and deploy the linked Italus Community gateway.

**Architecture:** Beehiiv remains the authoritative discussion and subscriber service. The static Italus site provides the branded entrance and links each card directly to a Beehiiv channel; the newsletter template links back to the main Writer's Room feed.

**Tech Stack:** Beehiiv dashboard, static HTML/CSS, Node.js test runner, GitHub, Vercel

**Spec:** `docs/superpowers/specs/2026-10-22-writers-block-community-design.md`

## Global Constraints

- Do not send or publish a newsletter during setup.
- Do not invite community members during setup.
- Preserve the approved Italus dark studio, parchment, and antique-gold theme; do not use purple text or controls.
- Use actual Beehiiv Community and channel URLs, not placeholders.
- Preserve unrelated worktree changes.

## Review Focus

- Every Community card must resolve to its own Beehiiv channel rather than the general feed.
- Navigation must remain usable at the existing mobile breakpoint.
- External Community links must use safe new-tab attributes.
- The new page must include canonical, Open Graph, primary navigation, and main-landmark metadata.
- The newsletter template must remain reusable and must not accidentally be sent or published.

---

### Task 1: Beehiiv Community and Channels

**Files:**
- External configuration: Beehiiv Community

**Interfaces:**
- Produces: main Community URL plus four channel URLs consumed by Tasks 2 and 3.

- [ ] **Step 1: Create the free Beehiiv Community without inviting members**
- [ ] **Step 2: Apply the approved name, description, studio colors, and conservative messaging defaults**
- [ ] **Step 3: Create or rename channels to the four approved discussions**
- [ ] **Step 4: Record and verify the main feed and channel URLs**

### Task 2: Italus Community Gateway

**Files:**
- Create: `community.html`
- Modify: `styles.css`
- Modify: all public `*.html` navigation and footer blocks
- Modify: `sitemap.xml`
- Modify: `tests/site.test.mjs`
- Create: `assets/themes/original/studio-bg-clean.png`
- Create: `assets/themes/original/logo-medallion.png`

**Interfaces:**
- Consumes: Beehiiv URLs from Task 1.
- Produces: deployed public asset URLs and a branded Community gateway consumed by Task 3.

- [ ] **Step 1: Add failing page, navigation, sitemap, and per-channel link tests**
- [ ] **Step 2: Run `npm test` and verify the new assertions fail**
- [ ] **Step 3: Add the two supplied assets and implement the gateway page and responsive styles**
- [ ] **Step 4: Add Community navigation/footer links throughout the site and update the sitemap**
- [ ] **Step 5: Run `npm test` and verify all tests pass**

### Task 3: Writer's Block Monthly Template

**Files:**
- External configuration: Beehiiv post template `Writer's Block - Monthly Issue`

**Interfaces:**
- Consumes: deployed public image URLs and the main Writer's Room URL.
- Produces: saved reusable Beehiiv template with seven approved sections.

- [ ] **Step 1: Replace the existing template body with the approved author-first structure**
- [ ] **Step 2: Apply the clean studio banner, tree medallion, parchment body, and gold/brown styling**
- [ ] **Step 3: Point the Community call to action to the main Writer's Room URL**
- [ ] **Step 4: Preview desktop and mobile rendering and save without publishing**

### Task 4: Release and Verification

**Files:**
- Modify: Git history only through an additive feature commit

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: verified GitHub revision and Vercel production deployment.

- [ ] **Step 1: Run the complete static-site test suite and inspect Git diff/status**
- [ ] **Step 2: Commit only the intended community and template-supporting website files**
- [ ] **Step 3: Push the commit to the existing GitHub remote**
- [ ] **Step 4: Verify the Vercel production deployment, page metadata, responsive layout, and all five Beehiiv links**
