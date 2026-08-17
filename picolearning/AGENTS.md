# PicoLearning — agent context

Offline-first AI learning app (vanilla JS + IndexedDB). Sibling of PicoERP (`C:\projects\erp`), PicoScan (`C:\projects\picoscan`), and PicoExpense (`C:\projects\picoexpense`).

Layers: **UI → Services → Engines (pdf / search / learning / ai) → Repository → IndexedDB**. No IDB in UI.

- App: PicoLearning
- DB: `PicoLearning`
- PDF: PDF.js native text; OCR via PicoScan adapter only
- LLM: WebLLM through `js/ai/modelManager.js` + configurable `js/data/modelRegistry.js`
- Embeddings: local hash always; optional Transformers.js
- Do not implement EPUB/DOCX/PPTX yet — PDF only
- Do not upload documents, embeddings, or learning history

Bump `APP_VERSION`, `index.html?v=`, and `sw.js` `CACHE_VERSION` together.

Read `README.md` and `DATA_MODEL.md` before large changes.
