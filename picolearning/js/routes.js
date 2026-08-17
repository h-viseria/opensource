/**
 * Route table + first-run gate.
 */

import { SETTINGS_KEYS } from './core/constants.js';
import {
  register,
  registerNotFound,
  setBeforeNavigate,
  navigate,
} from './core/router.js';
import { getSetting } from './services/settingsService.js';
import { renderHome } from './ui/pages/home.js';
import { renderLibrary } from './ui/pages/library.js';
import { renderDocument } from './ui/pages/document.js';
import { renderLearn } from './ui/pages/learn.js';
import { renderAsk } from './ui/pages/ask.js';
import { renderQuiz } from './ui/pages/quiz.js';
import { renderProgress } from './ui/pages/progress.js';
import { renderSettings } from './ui/pages/settings.js';
import { renderOnboarding } from './ui/pages/onboarding.js';
import { renderPrivacy } from './ui/pages/privacy.js';
import { renderGuide } from './ui/pages/guide.js';
import { renderNotFound } from './ui/pages/notFound.js';

const SETUP_ALLOW = new Set(['/setup', '/privacy', '/guide']);

/**
 * Register all application routes and the setup gate.
 */
export function registerRoutes() {
  register('/home', { title: 'Home', render: renderHome });
  register('/library', { title: 'Library', render: renderLibrary });
  register('/document/:id', { title: 'Document', render: renderDocument });
  register('/learn', { title: 'Learn', render: renderLearn });
  register('/ask', { title: 'Ask', render: renderAsk });
  register('/quiz', { title: 'Quiz', render: renderQuiz });
  register('/progress', { title: 'Progress', render: renderProgress });
  register('/settings', { title: 'Settings', render: renderSettings });
  register('/setup', { title: 'Setup', render: renderOnboarding });
  register('/privacy', { title: 'Privacy', render: renderPrivacy });
  register('/guide', { title: 'Guide', render: renderGuide });

  registerNotFound({ title: 'Not found', render: renderNotFound });

  setBeforeNavigate(async (ctx) => {
    const setupComplete = await getSetting(SETTINGS_KEYS.SETUP_COMPLETE);
    if (setupComplete) return true;
    if (SETUP_ALLOW.has(ctx.path)) return true;
    navigate('/setup', { replace: true });
    return false;
  });
}
