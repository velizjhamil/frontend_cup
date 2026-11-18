import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { NetworkStatus } from './components/NetworkStatus';
import { syncPendingAttempts } from './lib/offlineSync';
import { router } from './routes';

export default function App() {
  // Al abrir la app (por si quedaron intentos pendientes de una sesión
  // anterior) y cada vez que vuelve la conexión, se intenta vaciar la cola
  // de intentos guardados sin internet.
  useEffect(() => {
    void syncPendingAttempts();

    const handleOnline = () => {
      void syncPendingAttempts();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  return (
    <>
      <NetworkStatus />
      <RouterProvider router={router} />
    </>
  );
}
