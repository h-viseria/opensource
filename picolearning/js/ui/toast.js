/**
 * Toast notifications via event bus.
 */

import { emit, on } from '../core/eventBus.js';
import { EVENTS } from '../core/constants.js';

/**
 * @param {string} message
 * @param {'info'|'success'|'error'|'warn'} [type]
 * @param {number} [durationMs]
 */
export function showToast(message, type = 'info', durationMs = 3200) {
  emit(EVENTS.TOAST, { message: String(message || ''), type, durationMs });
}

/**
 * Mount toast renderer on #toast-root (created by layout if missing).
 * @returns {() => void} unsubscribe
 */
export function initToasts() {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    root.className = 'toast-root';
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
  }

  return on(EVENTS.TOAST, ({ message, type = 'info', durationMs = 3200 }) => {
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    root.appendChild(el);

    window.setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      el.style.transition = 'opacity 180ms ease, transform 180ms ease';
      window.setTimeout(() => el.remove(), 200);
    }, durationMs);
  });
}
