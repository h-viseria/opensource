# js/pwa/ — progressive web app

| File | Purpose |
|------|---------|
| `register.js` | Registers `./sw.js`; surfaces update toast |

Root `sw.js` caches shell + runtime assets. JS uses **network-first** so renames/version bumps appear without wiping SW by hand; CSS/icons may be cache-first.

## Rules

- On release: bump `CACHE_VERSION` in `sw.js` and script `?v=` in `index.html`.
- Settings page offers “Check for updates” → `SKIP_WAITING`.
- SW only works over `http://` / `https://` (not `file://`).
