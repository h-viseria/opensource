# PicoScan — agent context

Offline OCR + local AI document scanning. Vanilla JS ES modules, no backend.

## Architecture

```
UI (src/ui) → Engine (src/engine) → Core model (src/core) + IndexedDB (src/db)
Widget API (src/widget) shares the same engine.
```

- Document model is the single source of truth for fields/export (never bind exports to raw OCR alone).
- All extracted fields must remain editable before export.
- Look & feel mirrors PicoERP tokens (teal brand, DM Sans / IBM Plex Mono).

## Commands

```bash
python -m http.server 30015
```

Open `http://127.0.0.1:30015`. Do **not** use `file://`.

Optional: `npm install && npm run dev` if using Vite.

## Phases

- Phase 1: standalone app (`src/main.js` → `src/ui/app.js`)
- Phase 2: embed widget (`widget.html` → `src/widget/main.js` → `src/ui/widgetApp.js`) for PicoERP FAB iframe
- Widget API (`src/widget/picoscan.js`) — methods are stable

## OCR / AI

- OCR: Tesseract.js (WASM) from `vendor/tesseract/` (~24 MB including eng + osd traineddata + cores)
- Scan pipeline auto-orients via `worker.detect()` (OSD) before OCR; disable with `autoOrient: false`
- Knowledge base (Train): category + sample doc + mapped CSV → IndexedDB `knowledge` / `categories`; applied on Scan when that category is selected
- Settings: download / upload KnowledgeBase JSON; full IndexedDB backup / restore
- PDF: `vendor/pdfjs/` · Excel: `vendor/xlsx/`
- Classification + field extraction: local heuristics + optional trained mappings
