# PicoExpense — agent context

Offline-first personal finance app (vanilla JS + IndexedDB). Sibling of PicoERP (`C:\projects\erp`) and PicoScan (`C:\projects\picoscan`).

Layers: **UI → Services → Engine → Repository → IndexedDB**. No IDB in UI. No voucher math here — this is not an ERP.

- App: PicoExpense / Pico Personal Finance
- DB: `PicoPersonalFinance`
- Do not implement investments or recurring transactions
- OCR: PicoScan adapter only (`js/ocr/picoScanAdapter.js`)
- Drive sync: `PicoExpenseBackup` / `PicoExpense_sync.exp.zip` (same UX as PicoERP)

Bump `APP_VERSION`, `index.html?v=`, and `sw.js` `CACHE_VERSION` together.

Read `README.md` and `DATA_MODEL.md` before large changes.
