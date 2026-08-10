# js/services/ — application use-cases

Orchestrate repositories + engines, emit events, write audit logs. Called by UI pages.

## Important services

| Service | Notes |
|---------|--------|
| `bookService.js` | Create/open books; seeds COA via templateId + inventory/tax masters |
| `coaService.js` | Groups/ledgers; `seedDefaultChartOfAccounts(bookId, templateId)` |
| `voucherService.js` | Post/list vouchers |
| `invoiceService.js` | Sales/Purchase + Credit/Debit notes (returns/cancel); GL + stock + tax |
| `inventoryService.js` | Items, movements, WA valuation, master seeding |
| `catalogueService.js` | Catalogue types + SKU attribute helpers |
| `taxService.js` | Tax codes + reports |
| `reportService.js` | Loads data → reporting engine |
| `backupService.js` | `*.erp.json` export/import; zip via `buildBackupZip` / `parseBackupFile` |
| `googleDriveService.js` | OAuth (`drive.file`) upload/update/list/download; Client ID in `googleDriveConfig.js` |
| `driveSyncService.js` | Folder-linked sync, launch compare, periodic upload |
| `gnuCashImportService.js` | Accounts + transactions CSV round-trip |
| `personalFinanceService.js` | Budgets/goals + PF reports |
| `invoiceTemplateService.js` | docx/odt placeholder fill |

## Rules

- `createBook` accepts `templateId` from `js/data/bookTemplates.js`.
- After mutating domain data, emit the matching `EVENTS.*` so the shell can refresh.
- UI should not duplicate service validation; throw `Error` with user-facing messages.
