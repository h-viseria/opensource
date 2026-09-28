if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}
if (window.caches?.keys) {
  caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
}
