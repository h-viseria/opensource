/**
 * Simple modal prompts (password, etc.).
 */

/**
 * Ask for a PDF password. Resolves with password string, or null if cancelled.
 * @param {{ title?: string, message?: string, incorrect?: boolean }} [opts]
 * @returns {Promise<string|null>}
 */
export function askPdfPassword(opts = {}) {
  const title = opts.title || 'PDF password required';
  const message =
    opts.message ||
    (opts.incorrect
      ? 'That password was incorrect. Enter the PDF password to continue.'
      : 'This PDF is password protected. Enter the password to unlock it for scanning.');

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="pdf-pw-title">
        <div class="modal__header">
          <h2 class="modal__title" id="pdf-pw-title">${escapeHtml(title)}</h2>
        </div>
        <div class="modal__body">
          <p class="muted" style="font-size:var(--text-sm);margin-bottom:0.75rem">${escapeHtml(message)}</p>
          <label class="field-label" for="pdf-pw-input">Password</label>
          <input id="pdf-pw-input" class="input" type="password" autocomplete="current-password" />
          <p class="modal__hint muted">Password stays in memory for this scan only — it is not saved.</p>
        </div>
        <div class="modal__footer">
          <button type="button" class="btn btn--ghost" data-modal="cancel">Cancel</button>
          <button type="button" class="btn btn--primary" data-modal="ok">Unlock</button>
        </div>
      </div>
    `;

    const finish = (value) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') finish(null);
      if (e.key === 'Enter') {
        const input = /** @type {HTMLInputElement|null} */ (backdrop.querySelector('#pdf-pw-input'));
        finish(input?.value ?? '');
      }
    };

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) finish(null);
    });
    backdrop.querySelector('[data-modal="cancel"]')?.addEventListener('click', () => finish(null));
    backdrop.querySelector('[data-modal="ok"]')?.addEventListener('click', () => {
      const input = /** @type {HTMLInputElement|null} */ (backdrop.querySelector('#pdf-pw-input'));
      finish(input?.value ?? '');
    });

    document.body.appendChild(backdrop);
    document.addEventListener('keydown', onKey);
    const input = /** @type {HTMLInputElement|null} */ (backdrop.querySelector('#pdf-pw-input'));
    input?.focus();
  });
}

/**
 * @param {string} str
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
