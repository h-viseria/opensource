/**
 * Ask-your-textbook façade: retrieval + LLM (WebLLM or demo).
 */

import { SETTINGS_KEYS } from '../core/constants.js';
import { answerQuestion } from '../ai/rag.js';
import { DemoLLMProvider } from '../ai/providers.js';
import { modelManager } from '../ai/modelManager.js';
import { retrieve } from '../search/retrieval.js';
import { getSetting } from './settingsService.js';

/**
 * Resolve an LLM: active WebLLM when profile ready, else DemoLLM.
 * Respects Settings → Demo mode.
 * @returns {Promise<{ generate: Function, name: string, isDemo: boolean }>}
 */
export async function getLlm() {
  const demoMode = await getSetting(SETTINGS_KEYS.DEMO_MODE);
  if (demoMode) {
    const demo = new DemoLLMProvider();
    return {
      generate: (opts) => demo.generate(opts),
      name: 'DemoLLM',
      isDemo: true,
    };
  }

  try {
    const provider = await modelManager.getActiveLlmProvider();
    if (provider) {
      return {
        generate: (opts) => provider.generate(opts),
        name: provider.getCapabilities?.()?.name || 'WebLLM',
        isDemo: false,
      };
    }
  } catch {
    /* fall through to demo */
  }
  const demo = new DemoLLMProvider();
  return {
    generate: (opts) => demo.generate(opts),
    name: 'DemoLLM',
    isDemo: true,
  };
}

/**
 * @param {string} documentId
 * @param {string} question
 * @param {{ topK?: number }} [opts]
 * @returns {Promise<{ answer: string, sources: object[], grounded: boolean, provider: string, isDemo: boolean }>}
 */
export async function askTextbook(documentId, question, opts = {}) {
  const llm = await getLlm();
  const result = await answerQuestion({
    question,
    documentId,
    retrieveFn: (q, rOpts) => retrieve(q, rOpts),
    llm,
    topK: opts.topK ?? 6,
  });
  return {
    ...result,
    provider: llm.name,
    isDemo: llm.isDemo,
  };
}
