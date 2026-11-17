import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { getSessionUser, signOut, useSession } from '../lib/auth-client';
import { useExamStore } from '../store/useExamStore';
import { useGuestStore } from '../store/useGuestStore';

function formatLastSynced(timestamp: number | null): string {
  if (!timestamp) return 'Nunca';
  return new Date(timestamp).toLocaleString('es-BO');
}

/**
 * Pantalla 3 de docs/PRODUCT.md (versión mínima de Fase 3): identidad del
 * usuario y estado del banco offline. El progreso y las recomendaciones
 * llegan en las fases 4 y 8.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  /**
   * `useSession` puede devolver `null`, un objeto todavía sin `user` mientras
   * hidrata o incluso un payload inesperado si el proxy falla. `getSessionUser`
   * valida la estructura antes de leer `user?.name` o `user?.email`.
   */
  const user = getSessionUser(session);
  const isGuest = useGuestStore((state) => state.isGuest);
  const leaveGuest = useGuestStore((state) => state.leaveGuest);

  const { isSyncing, lastSynced, questionCount, error, syncBank, loadLocalCount } = useExamStore();

  useEffect(() => {
    void loadLocalCount();
  }, [loadLocalCount]);

  const handleSignOut = async () => {
    if (user !== null) {
      try {
        await signOut();
      } catch (err) {
        console.error('[auth] Error al cerrar sesión:', err);
      }
    }
    leaveGuest();
    navigate('/');
  };

  const greeting = user?.name ? `Hola, ${user.name}` : 'Bienvenido, Invitado';
  const subtitle = user?.email ?? 'Tus intentos se guardan solo en este dispositivo.';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-blue-600 p-6">
          <h1 className="text-xl font-bold text-white">{greeting}</h1>
          <p className="text-blue-100 text-sm mt-1">{subtitle}</p>
        </div>

        <div className="p-6">
          {isGuest && !user && (
            <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Estás como invitado.{' '}
              <Link to="/login" className="font-medium underline">
                Creá una cuenta
              </Link>{' '}
              para no perder tu historial.
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 text-sm text-slate-700">
            <p className="flex justify-between">
              <span>Preguntas en el dispositivo</span>
              <strong>{questionCount}</strong>
            </p>
            <p className="flex justify-between mt-1">
              <span>Última sincronización</span>
              <strong>{formatLastSynced(lastSynced)}</strong>
            </p>
          </div>

          {error && (
            <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </p>
          )}

          {questionCount > 0 ? (
            <Link
              to="/simulation"
              className="block text-center w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3 px-4 rounded-xl transition-colors shadow-md"
            >
              Nuevo simulacro
            </Link>
          ) : (
            <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
              Descargá el banco para poder rendir un simulacro.
            </p>
          )}

          <Button
            type="button"
            className="mt-3"
            onClick={() => void syncBank()}
            disabled={isSyncing}
          >
            {isSyncing ? 'Sincronizando…' : 'Descargar banco de preguntas'}
          </Button>

          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="mt-3 w-full bg-white border border-slate-300 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-colors hover:bg-slate-50"
          >
            {user ? 'Cerrar sesión' : 'Salir del modo invitado'}
          </button>
        </div>
      </div>
    </div>
  );
}
