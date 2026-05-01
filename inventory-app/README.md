# Inventory App (Pure HTML + JS + IndexedDB)

Offline-first inventory/order/fulfilment web app with modular architecture.

## Location

- App root: `inventory-app/app`
- Entry page: `inventory-app/app/index.html`

## Features

- IndexedDB persistence via `app/core/db.js`
- Repository pattern with in-memory caching via `app/core/repository.js`
- Event-driven refresh via `app/core/eventBus.js`
- Master data CRUD (suppliers, buyers, commodities, commodity master)
- Transaction screens (order booking + fulfilment)
- Dashboard summary cards
- Search/sort/pagination table component
- Excel import/export with SheetJS
- Auto ID generation (`SUP001`, `BUY001`, `CMD001`, `ORD001`, etc.)
- Sample data seeded on first load

## Run

Open in browser:

1. Open `inventory-app/app/index.html` directly, or
2. Use a static server for best module compatibility.

Example (Node static server):

```bash
npx serve inventory-app/app
```

## Architecture

- `app/core`: DB abstraction, repository, helpers, event bus
- `app/modules`: feature modules
- `app/ui/components`: reusable vanilla UI components
- `app/services`: validation and excel services

## How to Extend

1. Add new store schema in `app/core/db.js` (`STORE_SCHEMAS` + version bump).
2. Create repository in `app/app.js`.
3. Add module folder under `app/modules/<module>` and initialize it in `app/app.js`.
4. Emit/listen events via `eventBus` for refresh flows.

## Replacing IndexedDB with APIs/RDBMS Later

The app already uses repository abstractions.

To replace IndexedDB:

1. Keep module/UI code unchanged.
2. Replace `GenericRepository` implementation with API client methods.
3. Keep same repository method signatures (`create`, `update`, `delete`, `get`, `getAll`, `queryByIndex`).
4. Keep events the same so refresh behavior remains unchanged.

