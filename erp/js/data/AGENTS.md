# js/data/ — seed templates & defaults

Static data only (no I/O).

| File | Purpose |
|------|---------|
| `coaTemplate.js` | Default/general `DEFAULT_COA_TEMPLATE` tree |
| `bookTemplates.js` | Industry templates (personal, housing society, textile, electronics, grocery, restaurant, pharmacy, freelancer, general) — COA + optional catalogue/units/categories |
| `googleDriveConfig.js` | OAuth Client ID + API key + sync folder/file names + intervals (publisher fills credentials) |
| `inventoryDefaults.js` | Default units, categories, warehouse |
| `taxDefaults.js` | Default tax codes / ledger names |
| `financeDefaults.js` | Goal template hints |
| `tallyMaps.js` | Tally reserved group → nature, voucher type names |

## Rules

- COA shape: roots with `nature` + `children[]` with `ledgers: string[]`.
- New industry → add to `BOOK_TEMPLATES` in `bookTemplates.js` (wired by `bookService.createBook`).
- Catalogue extras must not collide with core keys `brand|name|type|size`.
- Keep names of system ledgers (`Stock`, `Cost of Goods Sold`, `Input Tax`, `Output Tax`, …) stable — inventory/tax seeders look them up by name.
