# PicoOffice Lite

**Read. Annotate. Understand. Privately.**

PicoOffice Lite is a local-first document reader and PDF utility PWA. Documents are processed in the browser: there is no account, document upload, analytics, or server-side conversion.

## Run (no build step)

From this folder:

```powershell
python -m http.server 8766 --bind 127.0.0.1
```

Open **http://127.0.0.1:8766/** (or use `npm start`, which runs the same command).

The app is plain static files: `index.html`, `js/`, `css/`, and `vendor/`. Edit `js/` and refresh the browser.

## Project layout (PicoERP-style)

| Path | Role |
|------|------|
| `index.html` | Shell, import map, stylesheet |
| `js/app.js` | Bootstrap |
| `js/app/`, `js/pdf/`, `js/office/` | Application code |
| `css/styles.css` | Styles |
| `vendor/` | Vendored pdf.js, pdf-lib, fflate, mammoth, etc. |
| `sw.js` | Offline PWA shell |

## Maintainers

After changing dependencies in `package.json`:

```powershell
npm install
npm run vendor
```

Run tests:

```powershell
npm test
```

## Features

- PDF reader: continuous/single-page view, thumbnails, zoom/fit, navigation, selectable text, and search
- Real PDF annotations: highlight, underline, strikethrough, ink, free text, notes, shapes, lines, arrows, and signatures
- Merge, split, extract, delete, drag-reorder, rotate, and export pages
- Images to PDF and PDF to PNG/JPEG/ZIP
- Page numbers, watermarks, and metadata
- Embedded-JPEG compression that preserves text/vector content
- Grayscale, true black-and-white, light-background, and invert exports
- Installable offline application shell
- Read-only DOCX, PPTX, XLSX, TXT, CSV, Markdown, RTF, and common images

## Privacy architecture

- User documents remain in memory unless the user explicitly saves an output.
- The service worker caches application assets, never PDF files.
- Signatures are not persisted automatically.
- PDF JavaScript is disabled.
- Passwords are used only to open a selected file and are not stored.

## Technical architecture

- PDF.js renders pages, text layers, thumbnails, search, and password-protected documents.
- Mammoth renders DOCX to sanitized HTML. PPTX and XLSX are parsed locally from their Office XML packages. Formulas are displayed from stored results and are never calculated. Macros are never executed.
- `pdf-lib` performs structural edits and writes annotations/utilities.
- Compression runs in a Web Worker and replaces compatible JPEG XObjects in place.
- Page-colour transforms use PDF.js + Canvas and export a new PDF.
- File System Access is used on supporting Chromium browsers; all others use file-input/download fallbacks.

## Honest limitations

- Whole-page grayscale/light-background/invert rasterizes selected pages; selectable text and vectors on those pages are lost. Image-only mode preserves them but cannot recolor vector backgrounds.
- Compression currently recompresses compatible DCT/JPEG image objects. JBIG2, CCITT, JPEG2000, inline images, masks, and unusual colour spaces are left untouched.
- Tool exports from password-protected PDFs are unprotected copies because `pdf-lib` does not preserve PDF encryption.
- Any rewritten PDF may invalidate an existing cryptographic signature. PicoOffice signatures are visual signatures, not compliant digital signatures.
- Very large scanned files can exceed mobile browser memory. Desktop Chrome/Edge provides the strongest experience.
- File System Access is not available in Firefox or Safari; downloads are used instead.
- Office viewing is read-only and not a pixel-perfect Word, PowerPoint, or Excel layout. Password-protected Office files and legacy `.doc`, `.xls`, and `.ppt` files are not supported. Very large spreadsheets show the first 2,000 rows and 64 columns.

## License

GPL-3.0-or-later
