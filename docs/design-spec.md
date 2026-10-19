# Italus Public Website Design Specification

## Purpose

Create the public-facing website for Italus, an AI-assisted narrative studio for novelists. The site explains how author-controlled canon, prose guardrails, revision workflows, token-budget tracking, and a tamper-evident creative ledger help writers use AI without surrendering authorship.

## Launch boundary

This release is a complete promotional website and local prototype. The author application, authentication, billing, manuscript workspace, and production data services are represented by clearly labeled future-entry pages and calls to action. No visitor should mistake a preview control for an active subscription or production application.

## Audience and conversion

The primary audience is fiction authors who want AI assistance while retaining creative control. Secondary audiences include writing groups, editors, agents, and publishers interested in provenance and budget transparency.

Primary conversion actions are:

1. Join the waitlist.
2. Request early access.
3. Start a future free trial.

During local preview, forms validate in the browser and disclose that delivery will be connected before launch.

## Information architecture

- Home: positioning, value proposition, benefits, product preview, calls to action.
- How It Works: author-led workflow from canon through accepted manuscript.
- Features: canon, prose rules, revision controls, ledger, and token budgets.
- Themes: Original, Mystery, Fantasy, and Science Fiction visual modes.
- Pricing: proposed plan structure without invented prices.
- About: mission, principles, and responsible-AI positioning.
- Updates: promotional landing content, newsletter/waitlist form, and social sharing.
- Contact: early-access and partnership inquiries.
- Studio Preview: future Vercel application placeholder for sign-in, workspace, and trial entry.

## Visual direction

Use the supplied Italus visual bundle as reference material. The default design uses deep green-black surfaces, antique gold accents, warm parchment text, Georgia-style editorial typography, restrained light effects, leather-inspired buttons, the tree medallion, and atmospheric writing-desk imagery. Genre themes appear as product demonstrations rather than changing the entire marketing site.

Avoid generic SaaS card walls. Sections should progress from the authorship problem to the Italus method, proof-oriented product concepts, and a clear next step.

## Technical architecture

- Vanilla HTML5, CSS3, and JavaScript modules.
- Multiple static pages sharing one design system and navigation pattern.
- No framework and no runtime dependencies.
- Deployable as static files on Vercel.
- Proposed canonical domain: `https://italusbooks.com`.
- Accessible keyboard navigation, visible focus states, reduced-motion support, responsive layouts, and semantic landmarks.
- SEO metadata, canonical URLs, Open Graph/Twitter metadata, JSON-LD, `robots.txt`, and `sitemap.xml`.
- Social icons initially link to documented internal placeholders until official profile URLs are supplied.

## Content integrity

Do not invent customers, testimonials, usage statistics, pricing, publisher endorsements, or product availability. Future capabilities and unavailable actions must be labeled clearly. “Ledger” language describes recorded creative actions and provenance; it must not claim blockchain, legal certification, or publisher acceptance unless later substantiated.

## Acceptance criteria

- Every navigation link resolves locally.
- The site works at desktop and mobile widths.
- Forms reject invalid email addresses and show preview-mode confirmation for valid submissions.
- Social links are keyboard accessible and identify their destination status.
- The Studio Preview clearly separates the public website from the future application.
- All pages identify `italusbooks.com` as the proposed production domain.
- Automated tests pass and browser verification finds no console errors.

