/**
 * PicoLearning — identity and enumerations.
 */

export const APP_NAME = 'PicoLearning';
export const APP_DISPLAY_NAME = 'Pico Learning';
export const APP_VERSION = '0.1.1';
export const APP_SLUG = 'picolearning';

export const DB_NAME = 'PicoLearning';
export const DB_VERSION = 1;

export const AI_PROFILES = Object.freeze({
  LITE: 'LITE',
  STANDARD: 'STANDARD',
  ADVANCED: 'ADVANCED',
});

export const DOC_STATUS = Object.freeze({
  IMPORTED: 'imported',
  PROCESSING: 'processing',
  READY: 'ready',
  ERROR: 'error',
  CANCELLED: 'cancelled',
});

export const JOB_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  DONE: 'done',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

export const QUESTION_TYPES = Object.freeze({
  MCQ: 'mcq',
  SHORT: 'short',
  CONCEPTUAL: 'conceptual',
  TRUE_FALSE: 'true_false',
});

export const LEARNING_MODES = Object.freeze({
  QUICK: 'quick',
  DEEP: 'deep',
  EXAM: 'exam',
  REVISION: 'revision',
});

export const OBJECTIVES = Object.freeze({
  GENERAL: 'general',
  EXAM: 'exam',
  PROFESSIONAL: 'professional',
  REVISION: 'revision',
});

export const DIFFICULTY = Object.freeze({
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
});

export const STORES = Object.freeze({
  DOCUMENTS: 'documents',
  PAGES: 'pages',
  CHAPTERS: 'chapters',
  CHUNKS: 'chunks',
  EMBEDDINGS: 'embeddings',
  QUESTIONS: 'questions',
  FLASHCARDS: 'flashcards',
  LEARNING_PROGRESS: 'learningProgress',
  QUIZ_ATTEMPTS: 'quizAttempts',
  MODELS: 'models',
  SETTINGS: 'settings',
  JOBS: 'jobs',
  KEYWORD_INDEX: 'keywordIndex',
});

export const SETTINGS_KEYS = Object.freeze({
  SETUP_COMPLETE: 'setupComplete',
  ACTIVE_PROFILE: 'activeProfile',
  THEME: 'theme',
  DEMO_MODE: 'demoMode',
  LEARNING_OBJECTIVE: 'learningObjective',
  DEFAULT_DIFFICULTY: 'defaultDifficulty',
  LAST_DOCUMENT_ID: 'lastDocumentId',
  HARDWARE_SNAPSHOT: 'hardwareSnapshot',
});

export const EVENTS = Object.freeze({
  ROUTE_CHANGE: 'route:change',
  TOAST: 'ui:toast',
  DATA_CHANGED: 'data:changed',
  JOB_PROGRESS: 'job:progress',
  MODEL_PROGRESS: 'model:progress',
  MODEL_READY: 'model:ready',
  DOC_PROGRESS: 'doc:progress',
});

export const THEMES = Object.freeze({
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
});
