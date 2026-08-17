# PicoExpense

Offline-first personal expense tracker. Data lives in IndexedDB (`PicoPersonalFinance`) on this device. No backend, no account, no telemetry.

Display name is configurable (`APP_NAME` / `APP_DISPLAY_NAME` in `js/core/constants.js`). Architecture is not coupled to the product name.

## User guide

In the app: **App → User guide** (`#/guide`), or command palette → User guide.

Written copy: [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md).

## Alternatives

Static comparison pages (open while serving this folder):

- Hub: [`alternatives/index.html`](alternatives/index.html)
- [Free YNAB alternative](alternatives/free-alternative-ynab/)
- [Free Monarch Money alternative](alternatives/free-alternative-monarch-money/)
- [Free Wallet alternative](alternatives/free-alternative-wallet/)
- [Free Goodbudget alternative](alternatives/free-alternative-goodbudget/)
- [Free Spendee alternative](alternatives/free-alternative-spendee/)

## Run

No build step.

```
python -m http.server
```

Open `http://localhost:8000`. For PicoScan OCR, serve the parent folder that contains both `picoexpense/` and `picoscan/` so `../picoscan/widget.html` resolves.

## Architecture

```
UI (js/ui) → Services (js/services) → Engine (js/engine) → Repositories → IndexedDB (js/db)
```

UI never touches IndexedDB. Engines are pure calculations (minor-unit integers). Services orchestrate persistence and events.

## IndexedDB

- Database: `PicoPersonalFinance`
- Schema version: `DB_VERSION` in `js/core/constants.js`
- Migrations in `js/db/schema.js` / `js/db/migrations.js` — upgrades never delete/recreate the database.

See `DATA_MODEL.md`.

## Backup

- JSON download (`*.exp.json`) is the canonical backup.
- ZIP of that JSON for Drive.
- Encrypted backup: passphrase + Web Crypto AES-GCM (`js/utils/crypto.js`).
- Restore: replace all, or merge by UUID.
- Google Drive: same flow as PicoERP — pick a folder, app uses/creates `PicoExpenseBackup/PicoExpense_sync.exp.zip`, compare local vs Drive, then upload or download. Credentials in `js/data/googleDriveConfig.js`.

## PicoScan

OCR is not reimplemented. See `docs/PICOSCAN.md`. If PicoScan is missing, manual entry still works.

## Tests

Open `tests/index.html` or:

```
node tests/run.mjs
```

## Adding a module

1. New store → bump `DB_VERSION`, add to `STORES` + `createV1Stores` (or a new migrate step). Never recreate the DB.
2. Repository via `createRepository`.
3. Service + optional pure engine.
4. UI page + route in `js/routes.js` + nav in `js/ui/layout.js`.
5. Bump `APP_VERSION`, `index.html?v=`, `sw.js` `CACHE_VERSION`.

Investments and recurring transactions are **not** in this release; leave store names free for later.

## PWA

`manifest.webmanifest` + `sw.js` (versioned cache). Core features work offline. Google Drive sign-in needs network.
