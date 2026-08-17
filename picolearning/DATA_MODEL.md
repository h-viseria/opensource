# PicoLearning data model

IndexedDB name: **PicoLearning**. Schema version: `DB_VERSION` (`js/core/constants.js`). Migrations never drop the database.

## Stores

| Store | Key | Purpose |
|-------|-----|---------|
| documents | id | PDF metadata, status, pageCount, title |
| pages | id | pageNumber, text, documentId |
| chapters | id | hierarchy, pageStart/End, sections |
| chunks | id | semantic chunks + keywords + page range |
| embeddings | id | chunkId → Float32Array-like vector |
| questions | id | MCQ / short / conceptual items |
| flashcards | id | front/back + SRS fields |
| learningProgress | id | topic mastery per document |
| quizAttempts | id | scored quiz sessions |
| models | id | installed AI profile records |
| settings | key | `{ key, value }` |
| jobs | id | processing / generation job state |
| keywordIndex | id | term → chunk postings |

## Processing pipeline

PDF → inspect → native text (or PicoScan OCR) → structure → chunks → keyword index → embeddings → READY.

## Privacy

No Firebase/Supabase/analytics. Model downloads are allowed; user content is not sent.
