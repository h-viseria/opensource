# PicoERP — agent context

Offline-first double-entry accounting ERP in the browser (vanilla JS + IndexedDB). No build step; serve with `python -m http.server`.

## Architecture (strict layers)

```
UI (js/ui) → Services (js/services) → Engine (js/engine) → Repositories (js/repositories) → IndexedDB (js/db)
```

- **Do not** put IndexedDB calls in UI pages.
- **Do not** put voucher/balance math in repositories.
- Engines are pure(ish) calculation; services orchestrate persistence + events.

## App identity

| Key | Value |
|-----|--------|
| Name | PicoERP (`APP_NAME`) |
| Version | `js/core/constants.js` → `APP_VERSION` |
| IndexedDB | `erpDataStore` (`DB_NAME`), schema `DB_VERSION` |
| Backup format | `picoerp.erp.json` (legacy `ledgerforge.erp.json` still restores) |
| Entry | `index.html` → `js/app.js` |
| Routes | `js/routes.js` + hash router `js/core/router.js` |
| Nav | `js/ui/layout.js` → `NAV` |
| User guide | `#/guide` → `js/ui/pages/userGuide.js` |

## Book model

- One **book** = one company/personal chart + vouchers + inventory + tax.
- Create book seeds COA from `js/data/bookTemplates.js` + inventory/tax masters.
- Active book required for most routes (`requiresBook: true`).

## Conventions when changing code

1. Match existing style (ES modules, JSDoc typedefs in `js/models/types.js`).
2. Bump `APP_VERSION` + `index.html?v=` + `sw.js` `CACHE_VERSION` when shipping UI/logic users must refresh.
3. New IndexedDB stores → bump `DB_VERSION`, update `js/db/schema.js`, `STORES`, backup `BOOK_SCOPED_STORES`.
4. Prefer editing the User Guide when adding user-facing screens.
5. Do not commit secrets; app is planned open-source.

## Folder map

| Path | Role |
|------|------|
| `js/core/` | Constants, router, events, account natures |
| `js/db/` | IndexedDB open/migrate/schema |
| `js/repositories/` | Store CRUD |
| `js/engine/` | Accounting, inventory WA, tax, reports, personal finance math |
| `js/services/` | Application use-cases |
| `js/ui/` | Shell, modals, export helpers |
| `js/ui/pages/` | Route screens |
| `js/data/` | COA templates, defaults |
| `js/models/` | JSDoc entity shapes |
| `js/utils/` | Money, dates, CSV, zip |
| `js/pwa/` | Service worker registration |
| `css/` | Design tokens + components |
| `icons/` | PWA / favicon (swastik brand mark) |
| `scripts/` | Icon generator, tooling |

Read the `AGENTS.md` in the folder you are editing for local rules.
