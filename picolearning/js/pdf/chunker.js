/**
 * Structural chunking with page fidelity, token-window overlap, and TF keywords.
 */

import { uuid } from '../core/uuid.js';

const TARGET_MIN_TOKENS = 600;
const TARGET_MAX_TOKENS = 900;
const OVERLAP_TOKENS = 80;
const CHARS_PER_TOKEN = 4;
const TARGET_MIN_CHARS = TARGET_MIN_TOKENS * CHARS_PER_TOKEN;
const TARGET_MAX_CHARS = TARGET_MAX_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;
const KEYWORD_TOP_N = 12;

const STOPWORDS = new Set(
  `a an the and or but if in on at to for of as by with from into over after
  before about against between through during without within along among
  is are was were be been being do does did doing have has had having
  this that these those it its we you they he she them us our your
  their not no nor so than then too very can could should would may might
  will just also only own same such both each few more most other some
  any all which who whom what when where why how`.split(/\s+/)
);

/**
 * @param {string} text
 */
export function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || '').length / CHARS_PER_TOKEN));
}

/**
 * @param {string} text
 * @param {number} [topN]
 * @returns {string[]}
 */
export function extractKeywords(text, topN = KEYWORD_TOP_N) {
  /** @type {Map<string, number>} */
  const tf = new Map();
  const tokens = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));

  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

  return [...tf.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([term]) => term);
}

/**
 * @param {Array<{ pageNumber: number, text: string }>} pages
 * @param {number} pageStart
 * @param {number} pageEnd
 */
function pagesInRange(pages, pageStart, pageEnd) {
  return pages
    .filter((p) => p.pageNumber >= pageStart && p.pageNumber <= pageEnd)
    .sort((a, b) => a.pageNumber - b.pageNumber);
}

/**
 * Build a continuous text with page markers for offset → page mapping.
 * @param {Array<{ pageNumber: number, text: string }>} pageSlice
 */
function buildAnnotated(pageSlice) {
  /** @type {Array<{ start: number, end: number, pageNumber: number }>} */
  const spans = [];
  const parts = [];
  let cursor = 0;
  for (const p of pageSlice) {
    const body = String(p.text || '').trim();
    if (!body) continue;
    if (parts.length) {
      parts.push('\n\n');
      cursor += 2;
    }
    const start = cursor;
    parts.push(body);
    cursor += body.length;
    spans.push({ start, end: cursor, pageNumber: p.pageNumber });
  }
  return { text: parts.join(''), spans };
}

/**
 * @param {Array<{ start: number, end: number, pageNumber: number }>} spans
 * @param {number} start
 * @param {number} end
 */
function pagesForSpan(spans, start, end) {
  const hit = spans.filter((s) => s.end > start && s.start < end);
  if (!hit.length) {
    const fallback = spans[0]?.pageNumber ?? 1;
    return { pageStart: fallback, pageEnd: fallback };
  }
  return {
    pageStart: hit[0].pageNumber,
    pageEnd: hit[hit.length - 1].pageNumber,
  };
}

/**
 * Split text into ~600–900 token windows with ~80 token overlap.
 * Breaks on paragraph/sentence boundaries when possible.
 *
 * @param {string} text
 * @returns {Array<{ text: string, start: number, end: number }>}
 */
function windowSplit(text) {
  const full = String(text || '').trim();
  if (!full) return [];
  if (full.length <= TARGET_MAX_CHARS) {
    return [{ text: full, start: 0, end: full.length }];
  }

  /** @type {Array<{ text: string, start: number, end: number }>} */
  const windows = [];
  let start = 0;

  while (start < full.length) {
    let end = Math.min(full.length, start + TARGET_MAX_CHARS);
    if (end < full.length) {
      const slice = full.slice(start, end);
      const preferMin = Math.min(slice.length, TARGET_MIN_CHARS);
      let breakAt = -1;
      const para = slice.lastIndexOf('\n\n');
      if (para >= preferMin * 0.5) breakAt = para;
      if (breakAt < 0) {
        const sent = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '));
        if (sent >= preferMin * 0.5) breakAt = sent + 1;
      }
      if (breakAt < 0) {
        const sp = slice.lastIndexOf(' ');
        if (sp >= preferMin * 0.5) breakAt = sp;
      }
      if (breakAt > 0) end = start + breakAt;
    }

    const chunkText = full.slice(start, end).trim();
    if (chunkText) windows.push({ text: chunkText, start, end });

    if (end >= full.length) break;
    const next = Math.max(start + 1, end - OVERLAP_CHARS);
    start = next;
  }

  return windows;
}

/**
 * @param {{
 *   documentId: string,
 *   pages: Array<{ pageNumber: number, text: string }>,
 *   chapters: Array<{
 *     id: string,
 *     title: string,
 *     pageStart: number,
 *     pageEnd: number,
 *     sections?: Array<{ id: string, title: string, pageStart: number, pageEnd: number }>
 *   }>
 * }} input
 */
export function chunkDocument({ documentId, pages, chapters }) {
  const pageList = [...(pages || [])].sort((a, b) => a.pageNumber - b.pageNumber);
  const chapterList =
    chapters?.length > 0
      ? chapters
      : [
          {
            id: uuid(),
            title: 'Document',
            pageStart: pageList[0]?.pageNumber ?? 1,
            pageEnd: pageList[pageList.length - 1]?.pageNumber ?? 1,
            sections: [],
          },
        ];

  /** @type {Array<{
   *   id: string,
   *   documentId: string,
   *   chapterId: string,
   *   chapterTitle: string,
   *   sectionId: string|null,
   *   sectionTitle: string|null,
   *   pageStart: number,
   *   pageEnd: number,
   *   text: string,
   *   keywords: string[],
   *   tokenEstimate: number
   * }>} */
  const chunks = [];

  for (const chapter of chapterList) {
    const sections =
      chapter.sections?.length > 0
        ? chapter.sections
        : [
            {
              id: null,
              title: chapter.title,
              pageStart: chapter.pageStart,
              pageEnd: chapter.pageEnd,
            },
          ];

    for (const section of sections) {
      const slice = pagesInRange(
        pageList,
        section.pageStart ?? chapter.pageStart,
        section.pageEnd ?? chapter.pageEnd
      );
      const { text, spans } = buildAnnotated(slice);
      if (!text.trim()) continue;

      for (const win of windowSplit(text)) {
        const { pageStart, pageEnd } = pagesForSpan(spans, win.start, win.end);
        const body = win.text.trim();
        if (!body) continue;
        chunks.push({
          id: uuid(),
          documentId,
          chapterId: chapter.id,
          chapterTitle: chapter.title || 'Chapter',
          sectionId: section.id ?? null,
          sectionTitle: section.title || null,
          pageStart,
          pageEnd,
          text: body,
          keywords: extractKeywords(body),
          tokenEstimate: estimateTokens(body),
        });
      }
    }
  }

  return chunks;
}
