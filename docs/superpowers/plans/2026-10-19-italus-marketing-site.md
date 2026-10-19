# Italus Marketing Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and locally preview a complete promotional website for the Italus narrative studio.

**Architecture:** A dependency-free multi-page static site uses shared CSS and JavaScript modules. Product application routes remain honest preview placeholders, while the public pages are production-shaped for a later GitHub-to-Vercel deployment.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript modules, Node.js built-in test runner, Vercel static hosting.

**Spec:** `docs/design-spec.md`

## Global Constraints

- Proposed canonical domain is `https://italusbooks.com`.
- Do not claim that preview forms, billing, subscriptions, or the author workspace are live.
- Do not invent testimonials, customers, prices, performance statistics, or publisher endorsements.
- Use only supplied assets and original site code.
- Keep runtime dependency-free.

---

### Task 1: Shared behavior and structural tests

**Files:**
- Create: `tests/site.test.mjs`
- Create: `js/site.mjs`

**Interfaces:**
- Produces: `isValidEmail(value): boolean`, `getFormConfirmation(type): string`, and `getCopyrightYear(date): number`.

- [ ] Write tests for email validation, preview-mode messages, current-year rendering, required pages, metadata, navigation, social placeholders, and application labeling.
- [ ] Run `node --test tests/site.test.mjs` and verify failure because `js/site.mjs` is absent.
- [ ] Implement the smallest shared module and page structure that satisfies each assertion.
- [ ] Re-run the test command and confirm all assertions pass.

### Task 2: Design system and supplied visual assets

**Files:**
- Create: `styles.css`
- Copy: selected files into `assets/`

**Interfaces:**
- Consumes: semantic classes used by every HTML page.
- Produces: responsive navigation, editorial typography, buttons, hero compositions, feature layouts, form controls, theme previews, and footer styling.

- [ ] Add selected supplied assets: the tree medallion, original desk background, three feature medallions, and genre thumbnails.
- [ ] Implement CSS tokens and responsive components from the approved dark literary direction.
- [ ] Add visible focus, reduced-motion, high-contrast, mobile navigation, and form-state styling.
- [ ] Run the structural test suite and confirm it remains green.

### Task 3: Public pages and conversion paths

**Files:**
- Create: `index.html`, `how-it-works.html`, `features.html`, `themes.html`, `pricing.html`, `about.html`, `updates.html`, `contact.html`, `studio.html`

**Interfaces:**
- Consumes: `styles.css`, `js/site.mjs`, and supplied assets.
- Produces: complete local visitor flow and honest preview calls to action.

- [ ] Build shared accessible navigation and footer on every page.
- [ ] Write product copy grounded only in supplied product facts.
- [ ] Add waitlist, early-access, contact, and future free-trial paths.
- [ ] Add promotional social copy and icon destinations on the Updates page.
- [ ] Run the structural tests and fix any unresolved links or missing metadata.

### Task 4: SEO and deployment shape

**Files:**
- Create: `robots.txt`, `sitemap.xml`, `vercel.json`, `README.md`, `.gitignore`

**Interfaces:**
- Produces: static Vercel configuration and proposed-domain discovery files.

- [ ] Add canonical metadata and per-page descriptions.
- [ ] Add SoftwareApplication JSON-LD with availability represented as pre-launch.
- [ ] Add sitemap entries for every public page and disallow no public content.
- [ ] Document local preview, future social URL replacement, GitHub publication, and custom-domain steps.
- [ ] Run all automated checks.

### Task 5: Local browser verification

**Files:**
- Create: `docs/local-preview-report.md`

**Interfaces:**
- Consumes: completed local website.
- Produces: verified preview URL and findings for user review.

- [ ] Start a local static server on an unused loopback port.
- [ ] Open the home page and exercise navigation, mobile menu, forms, and Studio Preview.
- [ ] Check key desktop and mobile layouts and inspect browser console output.
- [ ] Record verification evidence and open the local site for user approval.

