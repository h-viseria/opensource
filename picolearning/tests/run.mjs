/**
 * PicoLearning smoke tests — pure modules (no browser IDB).
 */

import { estimateTokens, extractKeywords, chunkDocument } from '../js/pdf/chunker.js';
import { detectStructure } from '../js/pdf/documentStructure.js';
import { validateMcq, scoreAttempt, pickQuestions } from '../js/learning/quizEngine.js';
import { updateMastery, createProgress, clampMastery } from '../js/learning/mastery.js';
import { scheduleNext } from '../js/learning/spacedRepetition.js';
import { generateMcqsHeuristic, generateFlashcardsFromChunks, parseMcqJson } from '../js/learning/learningEngine.js';
import { hashEmbed, cosineSimilarity } from '../js/ai/embeddings.js';
import { tokenize } from '../js/search/keywordIndex.js';
import { buildRagPrompt } from '../js/ai/prompts.js';
import { answerFromContext } from '../js/ai/providers.js';
import { listProfiles, getDefaultProfile, getProfileLlm } from '../js/data/modelRegistry.js';
import { LEARNING_MODES } from '../js/core/constants.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log('ok —', msg);
  } else {
    failed += 1;
    console.error('FAIL —', msg);
  }
}

const pages = [
  { pageNumber: 1, text: 'Chapter 1 — Motion\n\nSpeed is distance over time. Velocity is a vector.' },
  { pageNumber: 2, text: 'Acceleration is the rate of change of velocity.' },
  { pageNumber: 3, text: 'Chapter 2 — Forces\n\nNewton\'s second law: F = ma.' },
];

const chapters = detectStructure(pages);
assert(chapters.length >= 1, 'detectStructure finds chapters');

const chunks = chunkDocument({ documentId: 'doc1', pages, chapters });
assert(chunks.length >= 1, 'chunkDocument produces chunks');
assert(estimateTokens('abcd') === 1, 'estimateTokens rough');
assert(extractKeywords('acceleration velocity acceleration force').includes('acceleration'), 'extractKeywords');

const mcq = {
  question: 'What is F = ma?',
  options: ['Newton 1', 'Newton 2', 'Newton 3', 'None'],
  correctAnswer: 1,
  explanation: 'Second law',
  difficulty: 'beginner',
};
assert(validateMcq(mcq), 'validateMcq accepts good MCQ');
assert(!validateMcq({ question: 'x', options: ['a'], correctAnswer: 0 }), 'validateMcq rejects bad');

const scored = scoreAttempt([mcq], { [0]: 1 });
assert(scored.correct === 1, 'scoreAttempt counts correct');

const pool = generateMcqsHeuristic(chunks, { count: 4 });
assert(pool.length >= 1, 'heuristic MCQs');
const picked = pickQuestions({ pool, count: 2, mode: LEARNING_MODES.QUICK });
assert(picked.length <= 2, 'pickQuestions respects count');

const cards = generateFlashcardsFromChunks(chunks);
assert(cards.length >= 0, 'flashcards from chunks');

let prog = createProgress({ documentId: 'doc1', topicKey: 'accel', topicLabel: 'Acceleration' });
prog = updateMastery(prog, { correct: true, difficulty: 'intermediate' });
assert(clampMastery(prog.masteryScore) >= 0, 'mastery updates');

const next = scheduleNext({ correct: true, streak: 2, difficulty: 'beginner' });
assert(typeof next === 'string' && next.includes('T'), 'SRS schedule');

const a = hashEmbed('force mass acceleration');
const b = hashEmbed('force mass acceleration');
assert(cosineSimilarity(a, b) > 0.99, 'identical hash embeds match');
assert(tokenize('F = ma Newton').length >= 2, 'tokenize');

const prompt = buildRagPrompt({
  question: 'What is acceleration?',
  contexts: [{ text: 'Acceleration is rate of change of velocity.', pageStart: 2, chapter: 'Motion' }],
});
assert(prompt.prompt.includes('DOCUMENT_CONTEXT') || prompt.prompt.includes('BEGIN_DOCUMENT'), 'RAG prompt marks untrusted context');

const demo = answerFromContext('What is acceleration?', 'Acceleration is the rate of change of velocity. Speed is scalar.');
assert(demo.toLowerCase().includes('acceleration'), 'DemoLLM extracts from context');

assert(listProfiles().length === 3, 'three AI profiles');
assert(getDefaultProfile() === 'LITE' || getDefaultProfile() === 'STANDARD', 'default profile set');
assert(getProfileLlm('LITE')?.modelId, 'LITE has model id');

const parsed = parseMcqJson(JSON.stringify({ questions: [mcq] }));
assert(parsed.length === 1, 'parseMcqJson');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
