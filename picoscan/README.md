# PicoScan

Offline, privacy-first document OCR and field extraction in the browser.

Visual language aligned with **PicoERP** (teal brand, DM Sans, warm paper surfaces).

## Embed (PicoERP floating widget)

Compact panel entry (no service worker):

- [`widget.html`](./widget.html) — for iframe hosts
- Expected Pages layout: `/opensource/picoscan/widget.html` loaded from `/opensource/erp/`

## Run (no build step)

From this folder:

```bash
python -m http.server 30015
```

Open [http://127.0.0.1:30015](http://127.0.0.1:30015) (not `file://`). Hard-refresh after updates (`Ctrl+Shift+R`).

## Vendor libraries (~22 MB)

Shipped under `vendor/` so OCR/PDF/Excel work without a CDN:

| Path | Role | Approx size |
|------|------|-------------|
| `vendor/tesseract/` | Tesseract.js + WASM cores + eng/osd traineddata | ~24 MB |
| `vendor/pdfjs/` | PDF.js + worker | ~2 MB |
| `vendor/xlsx/` | SheetJS Excel export | ~0.9 MB |

First OCR load still reads those local files into memory (cached by the browser / service worker after).

## Features (Phase 1)

- Upload images / PDF, drag & drop, clipboard paste, camera
- Local preprocessing + **auto-orient** (Tesseract OSD) + offline OCR
- Local classification + field extraction
- Editable fields, validation, CSV / Excel / JSON export
- Local history + PWA service worker

## Phase 2 API

```js
window.PicoScan.init()
window.PicoScan.scan(file)
window.PicoScan.getJSON()
```
