import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getAttemptById } from '../api/client';
import { AttemptReviewView } from '../components/AttemptReviewView';
import { Button } from '../components/Button';
import { getSessionUser, useSession } from '../lib/auth-client';
import type { AttemptResultData } from '../types/attempt';

function formatHeaderDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Detalle del intento';
  const formatted = date.toLocaleString('es-BO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return `Intento del ${formatted}`;
}

/**
 * Pantalla de detalle histórico (`/history/:id`): muestra la revisión completa
 * de un simulacro pasado y habilita el botón de "Repasar mis errores".
 */
export default function AttemptDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const user = getSessionUser(session);

  const [detail, setDetail] = useState<AttemptResultData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!user || !id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await getAttemptById(id);
      setDetail(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo cargar el detalle del intento.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  if (!user) {
    return (
      <div className="min-h-full bg-background flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-6 text-center space-y-4">
          <h1 className="text-xl font-bold text-slate-900">Detalle disponible con tu cuenta</h1>
          <p className="text-sm text-slate-600">
            Iniciá sesión para revisar tus intentos históricos y repasar tus errores.
          </p>
          <Button type="button" onClick={() => navigate('/login')}>
            Iniciar sesión
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-full bg-background flex items-center justify-center p-4">
        <p className="text-sm text-slate-600 bg-white rounded-xl shadow px-5 py-4">
          Cargando revisión del simulacro…
        </p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="min-h-full bg-background flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-6 text-center space-y-4">
          <h1 className="text-xl font-bold text-slate-900">No pudimos abrir este intento</h1>
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
            {error ?? 'Intento no encontrado.'}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" onClick={() => void loadDetail()}>
              Reintentar
            </Button>
            <button
              type="button"
              onClick={() => navigate('/history')}
              className="w-full bg-white border border-slate-300 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-colors duration-200 hover:bg-slate-50"
            >
              Volver al historial
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AttemptReviewView
      evaluation={detail}
      headerSubtitle={formatHeaderDate(detail.endTime)}
      secondaryAction={
        <Link
          to="/history"
          className="block text-center w-full bg-white border border-slate-300 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-colors duration-200 hover:bg-slate-50"
        >
          Volver al historial
        </Link>
      }
    />
  );
}
