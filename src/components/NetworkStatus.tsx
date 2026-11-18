import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

/**
 * Banner global visible mientras el navegador no tiene conexión. Los intentos
 * terminados offline se encolan en IndexedDB (`src/lib/offlineSync.ts`) y se
 * envían solos al volver la red.
 */
export function NetworkStatus() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-white shadow-md"
    >
      Estás sin conexión. Los simulacros se guardarán localmente.
    </div>
  );
}
