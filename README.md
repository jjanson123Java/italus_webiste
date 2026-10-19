# Italus Website

Public promotional website and future application entry point for Italus, an author-led AI narrative studio.

## Local preview

From this directory:

```powershell
python -m http.server 8766
```

Then open `http://127.0.0.1:8766/`.

## Tests

```powershell
node --test tests/site.test.mjs
```

## Launch checklist

Before publication:

1. Replace preview forms with the approved waitlist/contact service.
2. Replace internal social placeholders on `updates.html` with official Italus profile URLs.
3. Confirm plan names, pricing, token allowances, and terms before enabling checkout.
4. Purchase `italusbooks.com`, add it to the Vercel project, and follow Vercel's displayed DNS records.
5. Confirm every production feature claim against the application release.

Source repository: `https://github.com/jjanson123Java/italus_webiste`.

The Vercel deployment and `italusbooks.com` domain connection are the next release steps.
