/**
 * Future local-AI boundary. Deterministic rules now; never calls a remote LLM.
 */

import { suggestCategory } from './masterService.js';

export async function classifyTransaction(input) {
  return suggestCategory(input);
}

export async function analyzeReceipt() {
  return { ok: false, reason: 'Local AI model not installed' };
}

export async function answerQuery() {
  return { ok: false, reason: 'Local AI model not installed' };
}

export async function generateInsight() {
  return { ok: false, reason: 'Local AI model not installed' };
}
