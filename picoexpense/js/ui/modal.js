/**
 * Modal helper — promise-based confirm / form dialogs.
 */

import { escapeHtml } from '../utils/html.js';

export { escapeHtml };

/**
 * @param {{ title: string, bodyHtml: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean, onReady?: (root: HTMLElement) => void }} opts
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
 *   bodyHtml: string,
 *   actions: Array<{ id: string, label: string, primary?: boolean, danger?: boolean }>,
 *   cancelLabel?: string,
 *   onReady?: (root: HTMLElement) => void,
 * }} opts
 * @returns {Promise<string|null>}
 */
export function actionModal(opts) {
  return new Promise((resolve) => {
    const actions = Array.isArray(opts.actions) ? opts.actions : [];
    const actionBtns = actions
      .map((a) => {
        const cls = a.danger ? 'btn--danger' : a.primary ? 'btn--primary' : 'btn--secondary';
        return `<button type="button" class="btn ${cls}" data-action-id="${escapeHtml(a.id)}">${escapeHtml(a.label)}</button>`;
      })
      .join('');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal__header">
          <h2 class="modal__title" id="modal-title">${escapeHtml(opts.title)}</h2>
          <button type="button" class="btn btn--ghost btn--sm" data-action="cancel" aria-label="Close">✕</button>
        </div>
        <div class="modal__body">${opts.bodyHtml}</div>
        <div class="modal__footer" style="flex-wrap:wrap;gap:0.5rem">
          <button type="button" class="btn btn--secondary" data-action="cancel">${escapeHtml(opts.cancelLabel || 'Cancel')}</button>
          ${actionBtns}
        </div>
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

    overlay.addEventListener('click', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target === overlay) close(null);
      if (target.closest('[data-action="cancel"]')) close(null);
      const actionEl = target.closest('[data-action-id]');
      if (actionEl) {
        const id = actionEl.getAttribute('data-action-id');
        if (id) close(id);
      }
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
    const primary =
      overlay.querySelector('[data-action-id].btn--primary') ||
      overlay.querySelector('[data-action-id]');
    if (primary instanceof HTMLElement) primary.focus();
  });
}

/**
 * @param {{ title: string, fieldsHtml: string, confirmLabel?: string, onReady?: (root: HTMLElement) => void }} opts
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
            <button type="button" class="btn btn--secondary" data-action="cancel">Cancel</button>
            <button type="submit" class="btn btn--primary">${escapeHtml(opts.confirmLabel || 'Save')}</button>
          </div>
        </form>
      </div>
    `;

    const form = overlay.querySelector('form');
    const close = (result) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
    };

    overlay.addEventListener('click', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target === overlay) close(null);
      if (target.closest('[data-action="cancel"]')) close(null);
    });

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      close(new FormData(/** @type {HTMLFormElement} */ (form)));
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    if (typeof opts.onReady === 'function') {
      try {
        opts.onReady(overlay);
      } catch (err) {
        console.error(err);
      }
    }
    const first = overlay.querySelector('input, select, textarea');
    if (first instanceof HTMLElement) first.focus();
  });
}
