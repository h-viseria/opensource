export function createEventBus() {
    const listenersByEvent = new Map();

    function subscribe(eventName, handler) {
        if (!listenersByEvent.has(eventName)) {
            listenersByEvent.set(eventName, new Set());
        }
        listenersByEvent.get(eventName).add(handler);

        return () => {
            const handlers = listenersByEvent.get(eventName);
            if (!handlers) return;
            handlers.delete(handler);
            if (handlers.size === 0) {
                listenersByEvent.delete(eventName);
            }
        };
    }

    function publish(eventName, payload) {
        const handlers = listenersByEvent.get(eventName);
        if (!handlers) return;
        handlers.forEach((handler) => handler(payload));
    }

    return { subscribe, publish };
}

