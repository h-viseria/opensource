/**
 * 404 page.
 */

import { escapeHtml } from '../../utils/html.js';
import { getOutlet } from './helpers.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 */
export async function renderNotFound(ctx) {
  const outlet = getOutlet();
  outlet.innerHTML = `
    <div class="page">
      <h1>Page not found</h1>
      <p class="lede">No route matches <span class="mono">${escapeHtml(ctx.path || '')}</span>.</p>
      <a class="btn btn--primary" href="#/home">Go home</a>
    </div>
  `;
}
