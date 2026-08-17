/**
 * LLM providers for PicoLearning.
 *
 * AIProvider interface (duck-typed):
 *   initialize({ modelId, onProgress }) → Promise<void>
 *   generate({ prompt, system }) → Promise<string>
 *   generateStream({ prompt, system, onToken }) → Promise<string>
 *   dispose() → Promise<void>
 *   getCapabilities() → { streaming: boolean, offline: boolean, needsDownload: boolean, name: string }
 */

import { DOCUMENT_CONTEXT_BEGIN, DOCUMENT_CONTEXT_END } from './prompts.js';

const WEBLLM_CDN = 'https://esm.run/@mlc-ai/web-llm';

/** @type {typeof import('@mlc-ai/web-llm')|null} */
let webllmModule = null;

/**
 * Dynamically load WebLLM from CDN.
 * @returns {Promise<any>}
 */
async function loadWebLlm() {
  if (webllmModule) return webllmModule;
  try {
    webllmModule = await import(/* @vite-ignore */ WEBLLM_CDN);
    return webllmModule;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to load WebLLM from ${WEBLLM_CDN}. Check network access or use DemoLLMProvider offline. (${detail})`,
    );
  }
}

/**
 * On-device WebLLM (MLC) provider. Model weights cache in browser Cache Storage.
 */
export class WebLLMProvider {
  constructor() {
    /** @type {any} */
    this._engine = null;
    /** @type {string|null} */
    this._modelId = null;
  }

  getCapabilities() {
    return {
      streaming: true,
      offline: true,
      needsDownload: true,
      name: 'WebLLM',
    };
  }

  /**
   * @param {{ modelId: string, onProgress?: (p: { progress: number, text: string }) => void }} opts
   */
  async initialize({ modelId, onProgress } = {}) {
    if (!modelId) throw new Error('WebLLMProvider.initialize requires modelId');
    const webllm = await loadWebLlm();
    const CreateMLCEngine = webllm.CreateMLCEngine || webllm.default?.CreateMLCEngine;
    if (typeof CreateMLCEngine !== 'function') {
      throw new Error('WebLLM module loaded but CreateMLCEngine is missing.');
    }

    if (this._engine && this._modelId === modelId) return;

    if (this._engine) {
      await this.dispose();
    }

    this._engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        if (typeof onProgress === 'function') {
          const progress =
            typeof report?.progress === 'number'
              ? report.progress
              : typeof report?.percentage === 'number'
                ? report.percentage / 100
                : 0;
          onProgress({
            progress: Math.min(1, Math.max(0, progress)),
            text: report?.text || `Loading ${modelId}…`,
          });
        }
      },
    });
    this._modelId = modelId;
  }

  /**
   * @param {{ prompt: string, system?: string }} opts
   * @returns {Promise<string>}
   */
  async generate({ prompt, system } = {}) {
    this._assertReady();
    const messages = buildMessages(prompt, system);
    const reply = await this._engine.chat.completions.create({
      messages,
      stream: false,
      temperature: 0.3,
    });
    return extractCompletionText(reply);
  }

  /**
   * @param {{ prompt: string, system?: string, onToken?: (token: string) => void }} opts
   * @returns {Promise<string>}
   */
  async generateStream({ prompt, system, onToken } = {}) {
    this._assertReady();
    const messages = buildMessages(prompt, system);
    const stream = await this._engine.chat.completions.create({
      messages,
      stream: true,
      temperature: 0.3,
    });

    let full = '';
    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content ?? '';
      if (delta) {
        full += delta;
        if (typeof onToken === 'function') onToken(delta);
      }
    }
    return full;
  }

  async dispose() {
    if (this._engine) {
      try {
        if (typeof this._engine.unload === 'function') await this._engine.unload();
        else if (typeof this._engine.dispose === 'function') await this._engine.dispose();
      } catch {
        /* ignore unload errors */
      }
    }
    this._engine = null;
    this._modelId = null;
  }

  _assertReady() {
    if (!this._engine) {
      throw new Error('WebLLMProvider is not initialized. Call initialize({ modelId }) first.');
    }
  }
}

/**
 * Offline demo provider: answers from retrieved context by keyword sentence extraction.
 * No model download required.
 */
export class DemoLLMProvider {
  getCapabilities() {
    return {
      streaming: false,
      offline: true,
      needsDownload: false,
      name: 'DemoLLM',
    };
  }

  async initialize() {
    /* no-op */
  }

  /**
   * @param {{ prompt: string, system?: string, context?: string }} opts
   */
  async generate({ prompt, system, context } = {}) {
    const question = extractQuestionFromPrompt(prompt) || prompt || '';
    const ctx = context || extractContextFromPrompt(prompt) || system || '';
    return answerFromContext(question, ctx);
  }

  /**
   * @param {{ prompt: string, system?: string, context?: string, onToken?: (t: string) => void }} opts
   */
  async generateStream(opts = {}) {
    const text = await this.generate(opts);
    if (typeof opts.onToken === 'function') opts.onToken(text);
    return text;
  }

  async dispose() {
    /* no-op */
  }
}

/**
 * @param {string} prompt
 * @param {string} [system]
 */
function buildMessages(prompt, system) {
  /** @type {{ role: string, content: string }[]} */
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt || '' });
  return messages;
}

/**
 * @param {any} reply
 */
function extractCompletionText(reply) {
  const content = reply?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === 'string' ? p : p?.text || ''))
      .join('')
      .trim();
  }
  return '';
}

/**
 * Pull the user question out of a RAG-style prompt when possible.
 * @param {string} prompt
 */
function extractQuestionFromPrompt(prompt) {
  const m = String(prompt || '').match(/Question:\s*([\s\S]+?)(?:\n\n|$)/i);
  return m ? m[1].trim() : '';
}

/**
 * @param {string} prompt
 */
function extractContextFromPrompt(prompt) {
  const start = String(prompt || '').indexOf(DOCUMENT_CONTEXT_BEGIN);
  const end = String(prompt || '').indexOf(DOCUMENT_CONTEXT_END);
  if (start === -1 || end === -1 || end <= start) return '';
  return String(prompt)
    .slice(start + DOCUMENT_CONTEXT_BEGIN.length, end)
    .trim();
}

/**
 * Extract sentences from context that share keywords with the question.
 * @param {string} question
 * @param {string} context
 */
export function answerFromContext(question, context) {
  const text = String(context || '').trim();
  if (!text) {
    return 'I could not find relevant passages in the document to answer this. Please try a different question or import more of the textbook.';
  }

  const keywords = tokenizeKeywords(question);
  const sentences = splitSentences(text);
  if (!sentences.length) {
    return 'I could not find relevant passages in the document to answer this.';
  }

  /** @type {{ sentence: string, score: number }[]} */
  const scored = sentences.map((sentence) => {
    const tokens = new Set(tokenizeKeywords(sentence));
    let score = 0;
    for (const k of keywords) {
      if (tokens.has(k)) score += 1;
      else if (sentence.toLowerCase().includes(k)) score += 0.5;
    }
    return { sentence, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const hits = scored.filter((s) => s.score > 0).slice(0, 4);

  if (!hits.length) {
    return 'No grounded answer found in the retrieved document passages. Try rephrasing or selecting a different chapter.';
  }

  const body = hits.map((h) => h.sentence.trim()).join(' ');
  return `${body}\n\n(Demo mode: answer assembled from matching sentences in the retrieved context — no generative model loaded.)`;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function tokenizeKeywords(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !DEMO_STOPWORDS.has(t));
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

const DEMO_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'can',
  'had',
  'her',
  'was',
  'one',
  'our',
  'out',
  'has',
  'have',
  'been',
  'were',
  'they',
  'this',
  'that',
  'with',
  'from',
  'what',
  'when',
  'where',
  'which',
  'who',
  'how',
  'why',
  'does',
  'did',
  'into',
  'about',
  'your',
  'their',
  'there',
  'then',
  'than',
  'them',
  'these',
  'those',
  'will',
  'would',
  'could',
  'should',
  'please',
  'explain',
  'describe',
  'define',
]);
