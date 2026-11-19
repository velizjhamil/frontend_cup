import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAttemptsHistory } from '../api/client';
import { Button } from '../components/Button';
import { getSessionUser, useSession } from '../lib/auth-client';
import type { AttemptHistoryItem } from '../types/attempt';

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-BO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function isPassedAttempt(item: AttemptHistoryItem): boolean {
  return item.score >= 20 || item.percentage >= 50;
}

/**
 * Pantalla de historial de simulacros del usuario autenticado (`GET /api/attempts`).
 * En modo invitado muestra la invitación a crear cuenta para guardar historial en la nube.
 */
export default function History() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const user = getSessionUser(session);

  const [attempts, setAttempts] = useState<AttemptHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    setError(null);

    try {
      const items = await getAttemptsHistory();
      setAttempts(items);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo cargar el historial de simulacros.';
      console.error('[historial] Error al cargar intentos:', err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  if (!user) {
    return (
      <div className="min-h-full bg-background flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-primary p-6 text-center">
            <h1 className="text-xl font-bold text-white">Historial de simulacros</h1>
            <p className="text-primary-foreground/80 text-sm mt-1">Disponible con tu cuenta</p>
          </div>

          <div className="p-6 space-y-4 text-center">
            <p className="text-sm text-slate-600">
              Estás navegando en modo invitado. Iniciá sesión o creá una cuenta para guardar y
              revisar tu historial de simulacros a lo largo del tiempo.
            </p>
            <Button type="button" onClick={() => navigate('/login')}>
              Iniciar sesión o crear cuenta
            </Button>
            <p className="text-xs text-slate-500">
              <Link to="/dashboard" className="hover:underline">
                Volver al dashboard
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totalAttempts = attempts.length;
  const averagePercentage =
    totalAttempts > 0
      ? Math.round(
          (attempts.reduce((acc, item) => acc + item.percentage, 0) / totalAttempts) * 100,
        ) / 100
      : 0;

  return (
    <div className="min-h-full bg-background pb-12">
      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
        <section className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-primary p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-white">Mi historial de simulacros</h1>
              <p className="text-primary-foreground/80 text-sm mt-0.5">{user.name || user.email}</p>
            </div>
            <Link
              to="/dashboard"
              className="text-sm font-medium text-white bg-primary-hover hover:bg-primary-hover px-3.5 py-2 rounded-lg transition-colors duration-200"
            >
              Volver al dashboard
            </Link>
          </div>

          <div className="p-6 space-y-5">
            {totalAttempts > 0 && (
              <dl className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4 text-center text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Simulacros rendidos</dt>
                  <dd className="text-lg font-bold text-slate-900 mt-0.5 tabular-nums">
                    {totalAttempts}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Promedio general</dt>
                  <dd className="text-lg font-bold text-slate-900 mt-0.5 tabular-nums">
                    {averagePercentage}%
                  </dd>
                </div>
              </dl>
            )}

            {isLoading && (
              <p className="text-sm text-slate-500 text-center py-6">Cargando tu historial…</p>
            )}

            {error && (
              <div className="space-y-3">
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  {error}
                </p>
                <Button type="button" onClick={() => void loadHistory()}>
                  Reintentar
                </Button>
              </div>
            )}

            {!isLoading && !error && attempts.length === 0 && (
              <div className="text-center py-8 space-y-4">
                <p className="text-sm text-slate-600">
                  Todavía no rendiste ningún simulacro con esta cuenta.
                </p>
                <div className="max-w-xs mx-auto">
                  <Button type="button" onClick={() => navigate('/simulation')}>
                    Rendir mi primer simulacro
                  </Button>
                </div>
              </div>
            )}

            {!isLoading && !error && attempts.length > 0 && (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-3 px-4 font-semibold">Fecha</th>
                      <th className="py-3 px-4 font-semibold">Nota</th>
                      <th className="py-3 px-4 font-semibold">Porcentaje</th>
                      <th className="py-3 px-4 font-semibold">Estado</th>
                      <th className="py-3 px-4 font-semibold text-right">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {attempts.map((item) => {
                      const passed = isPassedAttempt(item);

                      return (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors duration-200">
                          <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                            {formatDate(item.createdAt)}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                            {item.score} / {item.totalQuestions}
                          </td>
                          <td className="py-3 px-4 text-slate-700 tabular-nums whitespace-nowrap">
                            {item.percentage}%
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                                passed
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  : 'bg-rose-100 text-rose-800 border-rose-200'
                              }`}
                            >
                              {passed ? 'Aprobado' : 'Reprobado'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <Link
                              to={`/history/${item.id}`}
                              className="text-xs font-semibold text-primary hover:text-primary hover:underline"
                            >
                              Ver revisión
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!isLoading && attempts.length > 0 && (
              <div className="pt-2">
                <Button type="button" onClick={() => navigate('/simulation')}>
                  Nuevo simulacro
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
