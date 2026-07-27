# js/core/ — shared kernel

| File | Purpose |
|------|---------|
| `constants.js` | `APP_NAME`, `APP_VERSION`, `DB_NAME`, `DB_VERSION`, `STORES`, events, voucher/inventory enums |
| `router.js` | Hash router; sets `document.title` to `{route} — ${APP_NAME}` |
| `eventBus.js` | Pub/sub (`BOOK_CHANGED`, `COA_CHANGED`, `INVENTORY_CHANGED`, …) |
| `accountTypes.js` | Natures (Asset/Liability/Equity/Income/Expense), normal balance |
| `uuid.js` | ID generation |

## Rules

- Bumping schema → change `DB_VERSION` here and migrate in `js/db/schema.js`.
- New cross-cutting events → add to `EVENTS` in `constants.js`.
- Do not put business workflows here; use services.
