/**
 * Text embedding providers for offline / optional semantic search.
 */

const TRANSFORMERS_CDN = 'https://esm.run/@xenova/transformers';
const HASH_DIMS = 256;

/**
 * Always-available hashing-trick embeddings (no download).
 * Not semantic — useful for hybrid retrieval + demo mode.
 */
export class HashEmbeddingProvider {
  constructor(dims = HASH_DIMS) {
    this.dims = dims;
    this.modelId = 'local-hash-embedding';
  }

  getCapabilities() {
    return {
      dims: this.dims,
      needsDownload: false,
      offline: true,
      name: 'HashEmbedding',
    };
  }

  async initialize() {
    /* no-op */
  }

  /**
   * @param {string} text
   * @returns {Promise<Float32Array>}
   */
  async embed(text) {
    return hashEmbed(String(text || ''), this.dims);
  }

  async dispose() {
    /* no-op */
  }
}

/**
 * Optional Transformers.js MiniLM embeddings (user opt-in; downloads model).
 */
export class TransformersEmbeddingProvider {
  /**
   * @param {{ modelId?: string }} [opts]
   */
  constructor(opts = {}) {
    this.modelId = opts.modelId || 'Xenova/all-MiniLM-L6-v2';
    /** @type {any} */
    this._pipeline = null;
    this.dims = 384;
  }

  getCapabilities() {
    return {
      dims: this.dims,
      needsDownload: true,
      offline: true,
      name: 'TransformersEmbedding',
    };
  }

  /**
   * @param {{ onProgress?: (p: { progress: number, text: string }) => void }} [opts]
   */
  async initialize({ onProgress } = {}) {
    if (this._pipeline) return;
    let transformers;
    try {
      transformers = await import(/* @vite-ignore */ TRANSFORMERS_CDN);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to load @xenova/transformers from ${TRANSFORMERS_CDN}. (${detail})`,
      );
    }

    const { pipeline, env } = transformers;
    if (env) {
      env.allowLocalModels = false;
    }

    this._pipeline = await pipeline('feature-extraction', this.modelId, {
      progress_callback: (data) => {
        if (typeof onProgress !== 'function') return;
        const progress =
          data?.progress != null
            ? data.progress / 100
            : data?.status === 'ready'
              ? 1
              : 0;
        onProgress({
          progress: Math.min(1, Math.max(0, progress)),
          text: data?.status ? `${data.status}: ${data.file || this.modelId}` : `Loading ${this.modelId}`,
        });
      },
    });
  }

  /**
   * @param {string} text
   * @returns {Promise<Float32Array>}
   */
  async embed(text) {
    if (!this._pipeline) {
      throw new Error('TransformersEmbeddingProvider is not initialized.');
    }
    const output = await this._pipeline(String(text || ''), {
      pooling: 'mean',
      normalize: true,
    });
    const data = output?.data || output;
    const arr = data instanceof Float32Array ? data : new Float32Array(data);
    this.dims = arr.length;
    return arr;
  }

  async dispose() {
    this._pipeline = null;
  }
}

/**
 * Cosine similarity for equal-length vectors.
 * @param {ArrayLike<number>|Float32Array} a
 * @param {ArrayLike<number>|Float32Array} b
 * @returns {number}
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Embed text with the given provider (or HashEmbeddingProvider by default).
 * @param {string} text
 * @param {{ embed: (t: string) => Promise<Float32Array|number[]>, initialize?: Function, getCapabilities?: Function, _pipeline?: any }|null} [provider]
 * @returns {Promise<Float32Array>}
 */
export async function embedText(text, provider = null) {
  const p = provider || new HashEmbeddingProvider();
  const caps = typeof p.getCapabilities === 'function' ? p.getCapabilities() : null;
  if (caps?.needsDownload && typeof p.initialize === 'function' && !p._pipeline) {
    await p.initialize();
  }
  const vec = await p.embed(String(text || ''));
  return vec instanceof Float32Array ? vec : new Float32Array(vec);
}

/**
 * Feature hashing: tokenize → murmur-ish hash → signed dims → L2 normalize.
 * @param {string} text
 * @param {number} dims
 * @returns {Float32Array}
 */
export function hashEmbed(text, dims = HASH_DIMS) {
  const vec = new Float32Array(dims);
  const tokens = String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);

  for (const token of tokens) {
    const h = fnv1a(token);
    const idx = h % dims;
    const sign = h & 1 ? 1 : -1;
    vec[idx] += sign;
  }

  let norm = 0;
  for (let i = 0; i < dims; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dims; i++) vec[i] /= norm;
  }
  return vec;
}

/**
 * @param {string} str
 */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
