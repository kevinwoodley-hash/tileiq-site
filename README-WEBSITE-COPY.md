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
