import { STORES } from '../core/constants.js';
import { createRepository } from './storeRepository.js';

export const documentRepository = createRepository(STORES.DOCUMENTS);
export const pageRepository = createRepository(STORES.PAGES);
export const chapterRepository = createRepository(STORES.CHAPTERS);
export const chunkRepository = createRepository(STORES.CHUNKS);
export const embeddingRepository = createRepository(STORES.EMBEDDINGS);
export const questionRepository = createRepository(STORES.QUESTIONS);
export const flashcardRepository = createRepository(STORES.FLASHCARDS);
export const progressRepository = createRepository(STORES.LEARNING_PROGRESS);
export const quizAttemptRepository = createRepository(STORES.QUIZ_ATTEMPTS);
export const modelRepository = createRepository(STORES.MODELS);
export const settingsRepository = createRepository(STORES.SETTINGS);
export const jobRepository = createRepository(STORES.JOBS);
export const keywordIndexRepository = createRepository(STORES.KEYWORD_INDEX);
