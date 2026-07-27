# js/utils/ — shared helpers

| File | Purpose |
|------|---------|
| `money.js` | `roundMoney`, equality epsilon — **always** for amounts |
| `date.js` | ISO/display, FY start/end helpers, `toDateInput` |
| `csv.js` | Parse/serialize CSV |
| `zip.js` | Minimal zip read/write for docx/odt templates |

## Rules

- Prefer these helpers over ad-hoc `toFixed` / date math in services or UI.
- Keep utilities free of IndexedDB and UI imports.
