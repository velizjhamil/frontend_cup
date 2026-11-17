import { Navigate, Outlet } from 'react-router-dom';
import { getSessionUser, useSession } from '../lib/auth-client';
import { useGuestStore } from '../store/useGuestStore';

/**
 * Equivalente en el cliente al middleware del backend: si no hay sesión ni
 * modo invitado, no se renderiza la ruta protegida (dashboard, historial).
 */
export function RequireSession() {
  const { data: session, isPending } = useSession();
  const isGuest = useGuestStore((state) => state.isGuest);
  const user = getSessionUser(session);

  if (isGuest) {
    return <Outlet />;
  }

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Cargando…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
