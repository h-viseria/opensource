/**
 * Built-in demo corpus — short Physics sample (no PDF file required).
 * Clearly labeled for Demo Mode.
 */

import { DOC_STATUS } from '../core/constants.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import { HashEmbeddingProvider } from '../ai/embeddings.js';
import { detectStructure } from '../pdf/documentStructure.js';
import { chunkDocument, extractKeywords } from '../pdf/chunker.js';
import { buildIndexForChunks } from '../search/keywordIndex.js';
import {
  documentRepository,
  pageRepository,
  chapterRepository,
  chunkRepository,
  embeddingRepository,
  keywordIndexRepository,
} from '../repositories/index.js';

export const SAMPLE_TITLE = 'DEMO — Introduction to Motion';

/**
 * Multi-chapter sample page texts (Motion, Acceleration, Newton's Laws).
 * @type {Array<{ pageNumber: number, text: string }>}
 */
export const SAMPLE_TEXT = [
  {
    pageNumber: 1,
    text: `DEMO — Introduction to Motion

Table of Contents
Chapter 1 — Motion ........................ 2
Chapter 2 — Acceleration ................. 4
Chapter 3 — Newton's Laws ................ 6

This is a short demo textbook excerpt for PicoLearning.
All content is labeled DEMO and does not require a PDF upload.`,
  },
  {
    pageNumber: 2,
    text: `Chapter 1 — Motion

1.1 What is Motion

Motion is a change in the position of an object with respect to time and a chosen reference frame.
An object is at rest if its position does not change relative to that frame.

1.2 Distance and Displacement

Distance is the total path length travelled by an object.
Displacement is the straight-line change in position from start to finish and is a vector quantity.

Average speed is the total distance divided by the total time taken.
Average velocity is displacement divided by time and includes direction.`,
  },
  {
    pageNumber: 3,
    text: `1.3 Speed and Velocity

Speed is a scalar quantity that describes how fast an object is moving.
Velocity is a vector quantity that describes speed with direction.

Uniform motion is motion in which an object covers equal distances in equal intervals of time.
Non-uniform motion is motion in which equal distances are not covered in equal intervals of time.

Key idea: two cars can have the same speed but different velocities if they travel in different directions.`,
  },
  {
    pageNumber: 4,
    text: `Chapter 2 — Acceleration

2.1 Defining Acceleration

Acceleration is the rate of change of velocity with respect to time.
If velocity increases, acceleration is positive in the chosen direction.
If velocity decreases, the object has negative acceleration, often called deceleration.

Average acceleration is the change in velocity divided by the time interval.
Instantaneous acceleration is the acceleration at a particular moment.`,
  },
  {
    pageNumber: 5,
    text: `2.2 Equations of Motion

For motion with constant acceleration along a straight line:

v = u + a t
s = u t + (1/2) a t^2
v^2 = u^2 + 2 a s

Here u is initial velocity, v is final velocity, a is acceleration, t is time, and s is displacement.

Acceleration is central to understanding how forces change the motion of objects.`,
  },
  {
    pageNumber: 6,
    text: `Chapter 3 — Newton's Laws

3.1 First Law

Newton's first law states that an object remains at rest or in uniform motion in a straight line unless acted upon by a net external force.
Inertia is the tendency of an object to resist changes in its state of motion.

3.2 Second Law

Newton's second law states that the net force on an object is equal to the product of its mass and acceleration: F = m a.
Force is a vector quantity. Mass is a measure of inertia.`,
  },
  {
    pageNumber: 7,
    text: `3.3 Third Law

Newton's third law states that for every action there is an equal and opposite reaction.
If body A exerts a force on body B, then body B exerts a force equal in magnitude and opposite in direction on body A.

Example: when you push a wall, the wall pushes back on you with equal force.
These forces act on different bodies and therefore do not cancel each other on the same object.`,
  },
];

/**
 * Install the demo document with pages, chapters, chunks, embeddings, and keyword index.
 * Idempotent enough for demo use: creates a new document each call (caller may delete prior demos).
 *
 * @param {{ replaceExisting?: boolean }} [opts]
 * @returns {Promise<{ document: object, pages: object[], chapters: object[], chunks: object[], embeddings: object[] }>}
 */
export async function installSampleDocument(opts = {}) {
  if (opts.replaceExisting) {
    const all = await documentRepository.getAll();
    for (const d of all || []) {
      if (d?.source === 'demo' || d?.title === SAMPLE_TITLE) {
        const id = d.id;
        await Promise.all([
          pageRepository.deleteByIndex('documentId', id),
          chapterRepository.deleteByIndex('documentId', id),
          chunkRepository.deleteByIndex('documentId', id),
          embeddingRepository.deleteByIndex('documentId', id),
          keywordIndexRepository.deleteByIndex('documentId', id),
        ]);
        await documentRepository.delete(id);
      }
    }
  }

  const at = nowIso();
  const documentId = uuid();
  const pages = SAMPLE_TEXT.map((p) => ({
    id: uuid(),
    documentId,
    pageNumber: p.pageNumber,
    text: p.text,
  }));

  const chapters = detectStructure(SAMPLE_TEXT).map((ch) => ({
    ...ch,
    documentId,
  }));

  const chunks = chunkDocument({
    documentId,
    pages: SAMPLE_TEXT,
    chapters,
  });

  // Ensure keywords exist even if chunker already set them
  for (const c of chunks) {
    if (!c.keywords?.length) c.keywords = extractKeywords(c.text);
  }

  // Must match retrieval.js default HashEmbeddingProvider dims (256)
  const embedder = new HashEmbeddingProvider();
  const embeddings = [];
  for (const chunk of chunks) {
    const vector = Array.from(await embedder.embed(chunk.text));
    embeddings.push({
      id: uuid(),
      documentId,
      chunkId: chunk.id,
      dims: vector.length,
      vector,
      provider: embedder.modelId || 'local-hash-embedding',
      createdAt: at,
    });
  }

  const document = {
    id: documentId,
    title: SAMPLE_TITLE,
    fileName: 'demo-introduction-to-motion.txt',
    fileSize: SAMPLE_TEXT.reduce((n, p) => n + p.text.length, 0),
    mimeType: 'text/plain',
    pageCount: SAMPLE_TEXT.length,
    chapterCount: chapters.length,
    chunkCount: chunks.length,
    status: DOC_STATUS.READY,
    hasNativeText: true,
    source: 'demo',
    isDemo: true,
    errorMessage: null,
    createdAt: at,
    updatedAt: at,
  };

  await documentRepository.put(document);
  await pageRepository.putMany(pages);
  await chapterRepository.putMany(chapters);
  await chunkRepository.putMany(chunks);
  await embeddingRepository.putMany(embeddings);
  await buildIndexForChunks(chunks);

  return { document, pages, chapters, chunks, embeddings };
}
