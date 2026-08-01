// File: src/lib/serviceWorker.ts
export function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  if (window.location.hostname === 'localhost') {
    // Unregister any existing service workers in development
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
        console.log('SW unregistered for development');
      }
    });
    return;
  }

  // Register service worker for PWA (only in production)
  const register = () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered:', registration.scope);
      })
      .catch((error) => {
        console.log('SW registration failed:', error);
      });
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register);
  }
}
