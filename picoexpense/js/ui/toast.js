import { emit, on } from '../core/eventBus.js';
import { EVENTS } from '../core/constants.js';

export function showToast(message, type = 'info', durationMs = 3200) {
  emit(EVENTS.TOAST, { message, type, durationMs });
}

export function initToasts() {
  const root = document.getElementById('toast-root');
  if (!root) return () => {};
  return on(EVENTS.TOAST, ({ message, type = 'info', durationMs = 3200 }) => {
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', 'status');
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
