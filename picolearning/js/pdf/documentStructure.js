/**
 * Deterministic chapter / section detection from page text.
 * No LLM required — heading, numbering, ALL CAPS, and TOC heuristics.
 */

import { uuid } from '../core/uuid.js';

const CHAPTER_RE =
  /^(?:chapter|unit|part|module|lesson)\s+(\d+|[ivxlcdm]+)(?:\s*[:.\-–—]\s*|\s+)(.+)$/i;
const NUMBERED_RE = /^(\d+(?:\.\d+){0,3})\s+([A-Z][\w\s,'\-–—:]{2,80})$/;
const ALL_CAPS_RE = /^[A-Z][A-Z0-9\s,'\-–—:&()]{3,60}$/;
const TOC_LINE_RE = /^(.+?)\s+[·.•]{2,}\s*\d+\s*$|^(.+?)\s{2,}\d+\s*$/;
const SECTION_RE = /^(?:section|§)\s+(\d+(?:\.\d+)*)(?:\s*[:.\-–—]\s*|\s+)(.+)$/i;

/**
 * @param {string} line
 */
function cleanLine(line) {
  return String(line || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} line
 */
function looksLikeTocNoise(line) {
  return TOC_LINE_RE.test(line) || /^(contents|table of contents)$/i.test(line);
}

/**
 * @param {string} line
 * @returns {{ kind: 'chapter'|'section'|'heading', title: string, level: number }|null}
 */
function classifyHeading(line) {
  const t = cleanLine(line);
  if (!t || t.length > 120 || looksLikeTocNoise(t)) return null;

  const ch = t.match(CHAPTER_RE);
  if (ch) {
    const rest = cleanLine(ch[2] || '');
    return {
      kind: 'chapter',
      title: rest ? `Chapter ${ch[1]} — ${rest}` : `Chapter ${ch[1]}`,
      level: 1,
    };
  }

  const sec = t.match(SECTION_RE);
  if (sec) {
    return {
      kind: 'section',
      title: cleanLine(sec[2]) || `Section ${sec[1]}`,
      level: 2,
    };
  }

  const num = t.match(NUMBERED_RE);
  if (num) {
    const depth = num[1].split('.').length;
    const title = `${num[1]} ${cleanLine(num[2])}`;
    return {
      kind: depth <= 1 ? 'chapter' : 'section',
      title,
      level: depth,
    };
  }

  if (
    ALL_CAPS_RE.test(t) &&
    !/\d{4}/.test(t) &&
    t.split(' ').length <= 10 &&
    t.length >= 4
  ) {
    const titled = t
      .toLowerCase()
      .replace(/\b([a-z])/g, (m) => m.toUpperCase());
    return { kind: 'chapter', title: titled, level: 1 };
  }

  return null;
}

/**
 * Scan pages for structural headings.
 *
 * @param {Array<{ pageNumber: number, text: string }>} pages
 * @returns {Array<{ id: string, title: string, pageStart: number, pageEnd: number, sortOrder: number, sections: Array<{ id: string, title: string, pageStart: number, pageEnd: number, sortOrder: number }> }>}
 */
export function detectStructure(pages) {
  const sorted = [...(pages || [])].sort((a, b) => a.pageNumber - b.pageNumber);
  if (!sorted.length) {
    return [
      {
        id: uuid(),
        title: 'Document',
        pageStart: 1,
        pageEnd: 1,
        sortOrder: 0,
        sections: [],
      },
    ];
  }

  /** @type {Array<{ kind: string, title: string, level: number, pageNumber: number }>} */
  const markers = [];

  for (const page of sorted) {
    const lines = String(page.text || '').split(/\n+/);
    for (const raw of lines.slice(0, 40)) {
      const hit = classifyHeading(raw);
      if (!hit) continue;
      // Avoid duplicate consecutive identical titles on the same page
      const prev = markers[markers.length - 1];
      if (prev && prev.title === hit.title && prev.pageNumber === page.pageNumber) continue;
      markers.push({ ...hit, pageNumber: page.pageNumber });
    }
  }

  const chapterMarkers = markers.filter((m) => m.kind === 'chapter' || m.level === 1);
  const lastPage = sorted[sorted.length - 1].pageNumber;

  if (!chapterMarkers.length) {
    // Fall back: one chapter covering the whole document; treat section markers if any
    const sections = markers
      .filter((m) => m.kind === 'section')
      .map((m, i, arr) => ({
        id: uuid(),
        title: m.title,
        pageStart: m.pageNumber,
        pageEnd: i + 1 < arr.length ? arr[i + 1].pageNumber - 1 : lastPage,
        sortOrder: i,
      }))
      .map((s) => ({ ...s, pageEnd: Math.max(s.pageStart, s.pageEnd) }));

    return [
      {
        id: uuid(),
        title: 'Full Document',
        pageStart: sorted[0].pageNumber,
        pageEnd: lastPage,
        sortOrder: 0,
        sections,
      },
    ];
  }

  /** @type {ReturnType<typeof detectStructure>} */
  const chapters = [];

  for (let i = 0; i < chapterMarkers.length; i++) {
    const m = chapterMarkers[i];
    const pageStart = m.pageNumber;
    const pageEnd =
      i + 1 < chapterMarkers.length ? chapterMarkers[i + 1].pageNumber - 1 : lastPage;

    const sectionMarkers = markers.filter(
      (s) =>
        s.kind === 'section' &&
        s.pageNumber >= pageStart &&
        s.pageNumber <= Math.max(pageStart, pageEnd)
    );

    const sections = sectionMarkers.map((s, si, arr) => {
      const sEnd =
        si + 1 < arr.length
          ? arr[si + 1].pageNumber - 1
          : Math.max(pageStart, pageEnd);
      return {
        id: uuid(),
        title: s.title,
        pageStart: s.pageNumber,
        pageEnd: Math.max(s.pageNumber, sEnd),
        sortOrder: si,
      };
    });

    chapters.push({
      id: uuid(),
      title: m.title,
      pageStart,
      pageEnd: Math.max(pageStart, pageEnd),
      sortOrder: i,
      sections,
    });
  }

  // Ensure first page is covered if chapters start later
  if (chapters[0].pageStart > sorted[0].pageNumber) {
    chapters.unshift({
      id: uuid(),
      title: 'Introduction',
      pageStart: sorted[0].pageNumber,
      pageEnd: chapters[0].pageStart - 1,
      sortOrder: -1,
      sections: [],
    });
    chapters.forEach((c, i) => {
      c.sortOrder = i;
    });
  }

  return chapters;
}
