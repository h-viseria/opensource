# PicoLearning

Privacy-first, offline-first AI learning from your PDFs. Sibling of PicoERP (`C:\projects\erp`), PicoScan (`C:\projects\picoscan`), and PicoExpense (`C:\projects\picoexpense`).

Your documents, embeddings, questions, and learning history stay in IndexedDB (`PicoLearning`) on this device. No account. No cloud database. No telemetry.

## Run

No build step.

```
cd C:\projects\picolearning
python -m http.server 8787
```

Open `http://127.0.0.1:8787`.

For PicoScan OCR on scanned PDFs, serve the parent `C:\projects` folder so `../picoscan/widget.html` resolves.

## First run

1. Acknowledge privacy and pick an AI profile (Lite / Standard / Advanced).
2. Optionally download a WebLLM model (large; explicit user action).
3. Or skip download — Demo LLM + local hash embeddings still power Ask / quizzes from retrieved text.
4. Library → **Load demo document**, or drop a PDF with native text.

## Architecture

```
UI (js/ui) → Services (js/services) → Engines (pdf/search/learning/ai) → Repositories → IndexedDB
```

Reusable PicoAI pieces: `js/ai/*` (ModelManager, WebLLMProvider, RAG), `js/search/*` (hybrid retrieval).

## AI profiles

Configured in `js/data/modelRegistry.js` (not hard-coded forever):

| Profile | Intent |
|---------|--------|
| LITE | Smallest LLM, low RAM |
| STANDARD | Recommended balance |
| ADVANCED | Best quality, more VRAM |

Model downloads use WebLLM (network once). Inference is local.

## PicoScan

OCR adapter only: `js/ocr/picoScanAdapter.js`. Native PDF text uses PDF.js and does not need PicoScan.

## Docs

- [`DATA_MODEL.md`](DATA_MODEL.md)
- [`docs/PICOSCAN.md`](docs/PICOSCAN.md)
- In-app guide: `#/guide`

## Tests

Open `tests/index.html` or:

```
node tests/run.mjs
```

## Version bumps

Bump `APP_VERSION`, `index.html?v=`, and `sw.js` `CACHE_VERSION` together.
