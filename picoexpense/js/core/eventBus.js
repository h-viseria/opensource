/**
 * Lightweight publish/subscribe event bus.
 * Enables loose coupling between UI, services, and engine layers.
 */

const listeners = new Map();

/**
 * Subscribe to an event.
 * @param {string} event
 * @param {(payload: unknown) => void} handler
 * @returns {() => void} unsubscribe
 */
export function on(event, handler) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

/**
 * Unsubscribe a handler.
 * @param {string} event
 * @param {(payload: unknown) => void} handler
 */
export function off(event, handler) {
  const set = listeners.get(event);
  if (set) {
    set.delete(handler);
    if (set.size === 0) listeners.delete(event);
  }
}

/**
 * Emit an event to all subscribers.
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
      console.error(`[EventBus] handler error for "${event}":`, err);
    }
  }
}

/**
 * Subscribe once, then auto-unsubscribe.
 * @param {string} event
 * @param {(payload: unknown) => void} handler
 * @returns {() => void} unsubscribe
 */
export function once(event, handler) {
  const unsub = on(event, (payload) => {
    unsub();
    handler(payload);
  });
  return unsub;
}

/** Clear all listeners (tests / reset). */
export function clearAll() {
  listeners.clear();
}
