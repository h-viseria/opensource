# PicoScan integration (PicoLearning)

PicoLearning does **not** embed PicoScan’s OCR engine. Scanned/image PDFs use an adapter.

- Widget URL: `js/data/picoscanConfig.js` → `../picoscan/widget.html`
- Adapter: `js/ocr/picoScanAdapter.js`
- Native PDF text extraction (PDF.js) is independent of PicoScan

If the widget cannot be fetched:

> PicoScan is currently unavailable…

Serve parent `C:\projects` so both apps share origin.
