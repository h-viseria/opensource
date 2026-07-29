/**
 * Tiny event bus shared by app + widget.
 */

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/**
 * @param {string} event
 * @param {Function} handler
 */
export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

/**
 * @param {string} event
 * @param {Function} handler
 */
export function off(event, handler) {
  listeners.get(event)?.delete(handler);
}

/**
 * @param {string} event
 * @param {unknown} [payload]
 */
export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const handler of [...set]) {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[PicoScan] listener error on ${event}`, err);
    }
  }
}
