export function createEventBus() {
    const subscriptionsByEvent = new Map();

    return {
        subscribe(eventName, listener) {
            if (!subscriptionsByEvent.has(eventName)) {
                subscriptionsByEvent.set(eventName, []);
            }

            const listeners = subscriptionsByEvent.get(eventName);
            listeners.push(listener);

            return () => {
                const currentListeners = subscriptionsByEvent.get(eventName) || [];
                const nextListeners = currentListeners.filter((item) => item !== listener);
                subscriptionsByEvent.set(eventName, nextListeners);
            };
        },

        publish(eventName, payload) {
            const listeners = subscriptionsByEvent.get(eventName) || [];
            listeners.forEach((listener) => listener(payload));
        },
    };
}

