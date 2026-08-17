# PicoScan integration

PicoExpense does **not** embed PicoScan’s OCR engine. It talks to the existing PicoScan app through an adapter.

## How it is loaded

- Widget URL: `js/data/picoscanConfig.js` → `../picoscan/widget.html` (same origin sibling).
- Visible UI: `js/ui/picoscanFab.js` iframe panel (same pattern as PicoERP).
- Programmatic scan: `js/ocr/picoScanAdapter.js` loads a hidden iframe and calls the widget’s public `window.PicoScan.scan(file)` / `getJSON()` API when available.

## Adapter contract

Application code uses:

```
ocrService.extract({ file | document | rawText })
```

Never import PicoScan modules from `js/ui` or `js/services` except through `ocrService` / `picoScanAdapter`.

## Messages (inspected, not invented)

Same-origin `postMessage` from the widget:

| type | when |
|------|------|
| `picoscan:ready` | Widget booted (`src/widget/main.js`) |
| `picoscan:close` | User closed widget |
| `picoscan:result` | After a successful scan (`document` = `exportService.documentToJson`) |

Host only accepts `event.origin === window.location.origin` and `data.source === 'picoscan'`.

Public widget API (`src/widget/picoscan.js`): `init`, `open`, `close`, `scan`, `getJSON`, `getFields`, `getFieldMap`.

## OCR input / output

- Input: local `File`/`Blob` (JPG, PNG, WEBP, PDF) or an already-scanned document object.
- Output (normalized): merchant, date, total, currency, tax, payment method, rawText, fields, confidence.
- If PicoScan returns structured `fields`, they are preferred. Otherwise `js/ocr/receiptParser.js` parses `rawText` locally.

## Review

Results are **never** saved as transactions automatically. `#/ocr-review` lets the user edit every field, then Save / Save & Edit / Cancel / Rescan.

## Fallback

If `../picoscan/widget.html` cannot be fetched:

> PicoScan is currently unavailable. You can enter the transaction manually.

The rest of the app keeps working.

## Updating the integration

1. Inspect PicoScan’s widget API and `postMessage` types again.
2. Change only `js/ocr/picoScanAdapter.js` and `js/data/picoscanConfig.js`.
3. Keep `ocrService.extract` stable.
4. Do not copy PicoScan engine code into this repo.
