/**
 * Shared page helpers.
 */

import { DOC_STATUS, OBJECTIVES, DIFFICULTY, SETTINGS_KEYS } from '../../core/constants.js';
import { escapeHtml } from '../../utils/html.js';
import { listDocuments, getDocument } from '../../services/documentService.js';
import { getSetting, setSetting } from '../../services/settingsService.js';
import { chapterRepository, progressRepository } from '../../repositories/index.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {unknown} value
 */
export function isUuidLike(value) {
  return UUID_RE.test(String(value || '').trim());
}

/**
 * Human-readable topic name for progress rows / questions.
 * Resolves chapter titles when older records stored a chapter UUID as the label.
 *
 * @param {{ topicLabel?: string, topicKey?: string, chapterTitle?: string, chapterId?: string }} row
 * @param {Map<string, string>} [chapterTitleById]
 */
export function topicDisplayLabel(row, chapterTitleById) {
  const candidates = [row?.topicLabel, row?.chapterTitle, row?.topicKey];
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (!s) continue;
    if (s === 'general') return 'General';
    if (s === 'flashcards') return 'Flashcards';
    if (!isUuidLike(s)) return s;
  }
  const id = [row?.topicKey, row?.chapterId, row?.topicLabel].find((v) => isUuidLike(v));
  if (id && chapterTitleById?.has(id)) return chapterTitleById.get(id);
  return 'Topic';
}

/**
 * Build chapterId → title map (optionally scoped to document ids).
 * @param {string[]} [documentIds]
 * @returns {Promise<Map<string, string>>}
 */
export async function loadChapterTitleMap(documentIds) {
  /** @type {Map<string, string>} */
  const map = new Map();
  const ids = documentIds?.filter(Boolean);
  let chapters = [];
  if (ids?.length === 1) {
    chapters = (await chapterRepository.getAllByIndex('documentId', ids[0])) || [];
  } else {
    chapters = (await chapterRepository.getAll()) || [];
    if (ids?.length) {
      const allow = new Set(ids);
      chapters = chapters.filter((c) => allow.has(c.documentId));
    }
  }
  for (const ch of chapters) {
    if (ch?.id && ch?.title) map.set(ch.id, ch.title);
  }
  return map;
}

/**
 * Resolve + optionally persist readable labels on progress rows that still store UUIDs.
 * @param {object[]} rows
 * @returns {Promise<object[]>}
 */
export async function withResolvedTopicLabels(rows) {
  const list = rows || [];
  if (!list.length) return list;
  const map = await loadChapterTitleMap([...new Set(list.map((r) => r.documentId).filter(Boolean))]);
  const out = [];
  for (const row of list) {
    const label = topicDisplayLabel(row, map);
    if (row.topicLabel !== label && !isUuidLike(label)) {
      const updated = { ...row, topicLabel: label };
      try {
        await progressRepository.put(updated);
      } catch {
        /* display-only fallback */
      }
      out.push(updated);
    } else {
      out.push({ ...row, topicLabel: label });
    }
  }
  return out;
}

/**
 * @returns {HTMLElement}
 */
export function getOutlet() {
  const el = document.getElementById('outlet');
  if (!el) throw new Error('#outlet not found — call mountShell first');
  return el;
}

/**
 * @param {string} status
 */
export function statusBadge(status) {
  const s = String(status || '').toLowerCase();
  let cls = 'badge';
  if (s === DOC_STATUS.READY) cls += ' badge--ok';
  else if (s === DOC_STATUS.PROCESSING) cls += ' badge--warn';
  else if (s === DOC_STATUS.ERROR || s === DOC_STATUS.CANCELLED) cls += ' badge--danger';
  else cls += ' badge--muted';
  return `<span class="${cls}">${escapeHtml(status || 'unknown')}</span>`;
}

/**
 * Resolve a document id from query, last-used setting, or first ready doc.
 * @param {Record<string, string>} [query]
 * @returns {Promise<object|null>}
 */
export async function resolveActiveDocument(query = {}) {
  const fromQuery = query.documentId || query.doc || query.id;
  if (fromQuery) {
    const doc = await getDocument(fromQuery);
    if (doc) {
      await setSetting(SETTINGS_KEYS.LAST_DOCUMENT_ID, doc.id);
      return doc;
    }
  }
  const lastId = /** @type {string|undefined} */ (await getSetting(SETTINGS_KEYS.LAST_DOCUMENT_ID));
  if (lastId) {
    const doc = await getDocument(lastId);
    if (doc) return doc;
  }
  const docs = await listDocuments();
  const ready = docs.find((d) => d.status === DOC_STATUS.READY) || docs[0];
  if (ready) await setSetting(SETTINGS_KEYS.LAST_DOCUMENT_ID, ready.id);
  return ready || null;
}

/**
 * Document <select> markup.
 * @param {object[]} docs
 * @param {string} [selectedId]
 * @param {string} [name]
 */
export function documentSelectHtml(docs, selectedId, name = 'documentId') {
  if (!docs?.length) {
    return `<p class="muted">No documents yet. <a href="#/library">Import a PDF</a> or load the demo.</p>`;
  }
  return `
    <label class="field">
      <span class="field__label">Document</span>
      <select class="input" name="${escapeHtml(name)}" data-doc-select>
        ${docs
          .map(
            (d) =>
              `<option value="${escapeHtml(d.id)}" ${d.id === selectedId ? 'selected' : ''}>${escapeHtml(d.title || d.fileName || d.id)} (${escapeHtml(d.status)})</option>`
          )
          .join('')}
      </select>
    </label>`;
}

/**
 * Import options fieldset HTML (objective, difficulty, generate flags).
 */
export function importOptionsHtml() {
  return `
    <fieldset class="field-group">
      <legend>Learning options</legend>
      <label class="field">
        <span class="field__label">Objective</span>
        <select class="input" name="objective" data-objective>
          ${Object.values(OBJECTIVES)
            .map((o) => `<option value="${o}">${escapeHtml(o)}</option>`)
            .join('')}
        </select>
      </label>
      <label class="field">
        <span class="field__label">Difficulty</span>
        <select class="input" name="difficulty" data-difficulty>
          ${Object.values(DIFFICULTY)
            .map((d) => `<option value="${d}" ${d === DIFFICULTY.INTERMEDIATE ? 'selected' : ''}>${escapeHtml(d)}</option>`)
            .join('')}
        </select>
      </label>
      <label class="field field--check">
        <input type="checkbox" name="genQuestions" data-gen-questions checked />
        Generate quiz questions after processing
      </label>
      <label class="field field--check">
        <input type="checkbox" name="genFlashcards" data-gen-flashcards checked />
        Generate flashcards after processing
      </label>
    </fieldset>`;
}

/**
 * @param {number} score 0–100
 */
export function masteryBar(score) {
  const n = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  return `
    <div class="progress-bar" role="progressbar" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-bar__fill" style="width:${n}%"></div>
    </div>
    <span class="muted mono">${n}%</span>`;
}

/**
 * @param {string} iso
 */
export function formatWhen(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return String(iso);
  }
}
