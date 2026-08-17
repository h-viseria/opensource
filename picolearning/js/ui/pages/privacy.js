/**
 * Privacy statement (local-first learning app).
 */

import { APP_NAME } from '../../core/constants.js';
import { escapeHtml } from '../../utils/html.js';
import { getOutlet } from './helpers.js';

export const PRIVACY_SHORT =
  'PicoLearning keeps your textbooks, notes, quizzes, and progress in this browser. Study content is not uploaded to a PicoLearning server.';

/**
 * Full privacy copy used by /privacy and onboarding.
 */
export function privacyStatementHtml() {
  return `
    <div class="privacy-copy">
      <p>${PRIVACY_SHORT}</p>
      <h3>What stays on this device</h3>
      <ul>
        <li>Imported PDF text, chapters, and search indexes</li>
        <li>Embeddings, flashcards, quiz attempts, and mastery scores</li>
        <li>Settings such as theme, demo mode, and chosen AI profile</li>
        <li>Optional on-device model weights cached by the browser</li>
      </ul>
      <h3>What may leave the device</h3>
      <ul>
        <li>Downloading AI model weights from a model CDN when you choose a profile (LITE / STANDARD / ADVANCED)</li>
        <li>Nothing from your textbook text or learning progress is sent to PicoLearning cloud services — there is no account sync in this version</li>
      </ul>
      <h3>Demo mode</h3>
      <p>Demo mode and the built-in sample document use local heuristics. They do not require a model download and never transmit document text.</p>
      <h3>Your controls</h3>
      <ul>
        <li>Delete individual documents from the Library</li>
        <li>Clear all local data from Settings</li>
        <li>Skip model downloads and study with heuristics only</li>
      </ul>
      <p class="muted">${escapeHtml(APP_NAME)} is designed as a private study companion: your learning data stays on this device.</p>
    </div>
  `;
}

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 */
export async function renderPrivacy(_ctx) {
  const outlet = getOutlet();
  outlet.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Privacy</h1>
          <p class="lede">How ${escapeHtml(APP_NAME)} handles your study data.</p>
        </div>
      </div>
      <section class="panel">
        ${privacyStatementHtml()}
      </section>
      <a class="btn btn--secondary" href="#/home">Back</a>
    </div>
  `;
}
