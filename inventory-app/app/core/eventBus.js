export function createEventBus() {
    const handlers = new Map();

    function on(eventName, listener) {
        if (!handlers.has(eventName)) {
            handlers.set(eventName, new Set());
        }
        handlers.get(eventName).add(listener);
        return () => off(eventName, listener);
    }

    function off(eventName, listener) {
        const listeners = handlers.get(eventName);
        if (!listeners) return;
        listeners.delete(listener);
        if (!listeners.size) {
            handlers.delete(eventName);
        }
    }

    function emit(eventName, payload) {
        const listeners = handlers.get(eventName);
        if (!listeners) return;
        listeners.forEach((listener) => listener(payload));
    }

    return { on, off, emit };
}

