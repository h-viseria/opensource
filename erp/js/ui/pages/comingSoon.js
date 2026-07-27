/**
 * Placeholder page for modules not yet available.
 */

import { escapeHtml } from '../modal.js';

/**
 * @param {HTMLElement} outlet
 * @param {{ title: string, summary: string }} meta
 */
export function renderComingSoon(outlet, meta) {
  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">${escapeHtml(meta.title)}</h1>
        <p class="page-header__desc">${escapeHtml(meta.summary)}</p>
      </div>
    </div>
    <div class="panel">
      <div class="empty-state">
        <div class="empty-state__icon">⏳</div>
        <h2 class="empty-state__title">Coming soon</h2>
        <p class="empty-state__desc">
          This area is reserved in navigation. The screen will appear here when the module is ready.
        </p>
      </div>
    </div>
  `;
}
