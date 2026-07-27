# js/ui/ — presentation shell

Hash SPA UI. No IndexedDB here — call services.

## Key modules

| File | Purpose |
|------|---------|
| `layout.js` | Sidebar `NAV`, shell, book gate; keep hubs collapsible |
| `modal.js` | `confirmModal`, `formModal` (scrollable; supports `onReady`) |
| `toast.js` | Toasts |
| `reportHelpers.js` | Shared report filters / FY / amount cells |
| `reportExport.js` | CSV + in-app PDF/print preview (avoid popup/`noopener` traps) |
| `csvImport.js` | Reusable CSV import panel wiring |

## Rules

- Escape user strings with `escapeHtml` from `modal.js`.
- Modals: keep content in `.modal__body` (CSS scrolls); don’t rely on overlay-only scroll.
- After book switch, app remounts shell via `BOOK_CHANGED`.
- New top-level nav: add to `NAV` in `layout.js` **and** register in `js/routes.js`.
