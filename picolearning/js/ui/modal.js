/**
 * Promise-based confirm / form dialogs.
 */

import { escapeHtml } from '../utils/html.js';

/**
 * @param {{
 *   title: string,
 *   bodyHtml: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   danger?: boolean,
 *   onReady?: (root: HTMLElement) => void,
 * }} opts
 * @returns {Promise<boolean>}
 */
export function confirmModal(opts) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal__header">
          <h2 class="modal__title" id="modal-title">${escapeHtml(opts.title)}</h2>
          <button type="button" class="btn btn--ghost btn--sm" data-action="cancel" aria-label="Close">✕</button>
        </div>
        <div class="modal__body">${opts.bodyHtml}</div>
        <div class="modal__footer">
          <button type="button" class="btn btn--secondary" data-action="cancel">${escapeHtml(opts.cancelLabel || 'Cancel')}</button>
          <button type="button" class="btn ${opts.danger ? 'btn--danger' : 'btn--primary'}" data-action="confirm">${escapeHtml(opts.confirmLabel || 'Confirm')}</button>
        </div>
      </div>
    `;

    const close = (result) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
    };

    overlay.addEventListener('click', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target === overlay) close(false);
      const action = target.closest('[data-action]')?.getAttribute('data-action');
      if (action === 'cancel') close(false);
      if (action === 'confirm') close(true);
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    if (typeof opts.onReady === 'function') {
      try {
        opts.onReady(overlay);
      } catch {
        /* ignore */
      }
    }
    overlay.querySelector('[data-action="confirm"]')?.focus();
  });
}

/**
 * @param {{
 *   title: string,
 *   fieldsHtml: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   onReady?: (root: HTMLElement) => void,
 * }} opts
 * @returns {Promise<FormData|null>}
 */
export function formModal(opts) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <form>
          <div class="modal__header">
            <h2 class="modal__title" id="modal-title">${escapeHtml(opts.title)}</h2>
            <button type="button" class="btn btn--ghost btn--sm" data-action="cancel" aria-label="Close">✕</button>
          </div>
          <div class="modal__body">${opts.fieldsHtml}</div>
          <div class="modal__footer">
            <button type="button" class="btn btn--secondary" data-action="cancel">${escapeHtml(opts.cancelLabel || 'Cancel')}</button>
            <button type="submit" class="btn btn--primary">${escapeHtml(opts.confirmLabel || 'Save')}</button>
          </div>
        </form>
      </div>
    `;

    const close = (result) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
    };

    const form = overlay.querySelector('form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      close(new FormData(/** @type {HTMLFormElement} */ (form)));
    });

    overlay.addEventListener('click', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target === overlay) close(null);
      if (target.closest('[data-action="cancel"]')) close(null);
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    if (typeof opts.onReady === 'function') {
      try {
        opts.onReady(overlay);
      } catch {
        /* ignore */
      }
    }
    const first = overlay.querySelector('input, select, textarea');
    if (first instanceof HTMLElement) first.focus();
  });
}

export { escapeHtml };
