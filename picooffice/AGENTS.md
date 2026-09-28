# PicoOffice agent context

Privacy-first document reader and PDF toolkit. Vanilla JavaScript ES modules served as static files (like PicoERP); no backend.

## Layout

```
index.html, sw.js, css/, js/, vendor/
  js/app.js → js/app/, js/pdf/, js/office/, js/file/, js/workers/, js/pwa/
```

- PDF.js is the rendering/search/password layer (`vendor/pdfjs`).
- `pdf-lib` is the structural-edit/annotation layer (`vendor/pdf-lib`).
- Third-party libraries live in `vendor/` (sync with `npm run vendor` after dependency bumps).
- Never upload, remotely convert, or automatically persist user documents.
- Never execute embedded document JavaScript, Office macros, or formulas.
- DOCX, PPTX, XLSX, text, and images are read-only. Do not add Office editing in Lite.
- Generated PDFs must be reopened/validated before a feature is considered complete.
- Bump `CACHE_VERSION` in `sw.js` when shipping changed app-shell behavior.

## Commands

```powershell
python -m http.server 8766 --bind 127.0.0.1
# or: npm start

npm test
npm run vendor
```
