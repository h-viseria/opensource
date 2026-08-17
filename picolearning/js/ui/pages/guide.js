/**
 * Short getting-started guide (allowed during onboarding gate).
 */

import { escapeHtml } from '../../utils/html.js';
import { APP_NAME } from '../../core/constants.js';
import { getOutlet } from './helpers.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 */
export async function renderGuide(_ctx) {
  const outlet = getOutlet();
  outlet.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Guide</h1>
          <p class="lede">How to study with ${escapeHtml(APP_NAME)}.</p>
        </div>
      </div>
      <section class="panel">
        <ol class="stack" style="gap:1rem;padding-left:1.25rem">
          <li><strong>Complete setup</strong> — acknowledge privacy and pick an AI profile (download optional).</li>
          <li><strong>Import a PDF</strong> in Library, or load the demo document.</li>
          <li><strong>Learn</strong> with summaries and flashcards; <strong>Ask</strong> grounded questions; <strong>Quiz</strong> to build mastery.</li>
          <li><strong>Progress</strong> shows weak topics and upcoming reviews — all stored on this device.</li>
        </ol>
      </section>
      <div class="stack" style="flex-direction:row;gap:0.5rem">
        <a class="btn btn--primary" href="#/setup">Open setup</a>
        <a class="btn btn--secondary" href="#/privacy">Privacy</a>
      </div>
    </div>
  `;
}
