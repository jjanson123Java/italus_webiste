# Italus Local Preview Report

Date: October 19, 2026

## Preview

- URL: `http://127.0.0.1:8766/`
- Delivery state: published to GitHub; not yet deployed to Vercel.
- Proposed production domain: `https://italusbooks.com`.

## Checks performed

- Node test suite: 15 passing, 0 failing.
- HTTP responses: all nine pages, shared CSS, JavaScript, robots file, and sitemap returned `200`.
- Local link and asset scan: 0 missing references.
- Desktop screenshot reviewed at 1440px wide.
- Compact navigation and hero reviewed with a headless Chromium capture.
- Corrected two issues found during visual review: an unsuitable background image containing interface text, and hero layout sizing that could extend beyond compact viewports.

## Preview limitations

- Waitlist, contact, and early-access forms validate locally but do not send data.
- Social icons point to labeled internal placeholders until official Italus profiles exist.
- Free trial, authentication, subscriptions, billing, and the author workspace are preview entry points only.
- `italusbooks.com` is configured as the proposed canonical domain but has not been purchased or connected to Vercel.
