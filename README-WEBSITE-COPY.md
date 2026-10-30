# TileIQ Website Copy

This folder is the standalone public marketing website for TileIQ.

## Isolation boundary

This website copy intentionally excludes all application/native source code, including:

- `app/`
- `www/`
- `android/`
- `ios/`
- native build output
- application business logic
- Supabase/application scripts

Changes in this folder do not modify the TileIQ app.

## Website files

- `index.html` — redesigned marketing homepage
- `style.css` — website-only styling
- `script.js` — website-only navigation and reveal effects
- `_redirects` — retained routing rules for `/app` when deployed alongside the existing app

All main calls-to-action use the existing `/app` route. The app itself is not included here.

## Tests

Playwright end-to-end tests live in `tests/e2e/` and run against a local static server
(`tests/static-server.mjs`) that serves pages the way Cloudflare Pages does. All requests
to other sites (analytics, Formspree, Supabase) are blocked or mocked, so the tests run offline.

```bash
npm install
npx playwright install chromium   # first time only
npm test
```

They run on desktop and mobile (Pixel 7) viewports, and on every pull request via GitHub Actions.
