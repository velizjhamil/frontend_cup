import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchQuestions, getAttemptsHistory, getStudyRecommendations, getWeakPoints } from '../api/client';
import { AttemptHistoryChart } from '../components/AttemptHistoryChart';
import { Button } from '../components/Button';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { getSessionUser, signOut, useSession } from '../lib/auth-client';
import { db } from '../lib/db';
import { useExamStore } from '../store/useExamStore';
import { useGuestStore } from '../store/useGuestStore';
import { useSimulationStore } from '../store/useSimulationStore';
import type { AttemptHistoryItem, RecommendationsData, WeakPointsData } from '../types/attempt';

function formatLastSynced(timestamp: number | null): string {
  if (!timestamp) return 'Nunca';
  return new Date(timestamp).toLocaleString('es-BO');
}

/**
 * Pantalla 3 de docs/PRODUCT.md: identidad del usuario, estado del banco
 * offline, accesos al simulacro/práctica y sección "Mis Puntos Débiles".
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
  const userId = user?.id ?? null;
  const isGuest = useGuestStore((state) => state.isGuest);
  const leaveGuest = useGuestStore((state) => state.leaveGuest);

  const { isSyncing, lastSynced, questionCount, error, syncBank, loadLocalCount } = useExamStore();
  const startSimulation = useSimulationStore((state) => state.startSimulation);

  const [weakPoints, setWeakPoints] = useState<WeakPointsData | null>(null);
  const [isLoadingWeakPoints, setIsLoadingWeakPoints] = useState(false);
  const [weakPointsError, setWeakPointsError] = useState<string | null>(null);
  const [isStartingWeakRetry, setIsStartingWeakRetry] = useState(false);
  const [recommendations, setRecommendations] = useState<RecommendationsData | null>(null);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);
  const [attemptsHistory, setAttemptsHistory] = useState<AttemptHistoryItem[] | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    void loadLocalCount();
  }, [loadLocalCount]);

  useEffect(() => {
    if (!userId) {
      setWeakPoints(null);
      setWeakPointsError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingWeakPoints(true);
    setWeakPointsError(null);

    void (async () => {
      try {
        const data = await getWeakPoints();
        if (!cancelled) {
          setWeakPoints(data);
        }
      } catch (err) {
        if (!cancelled) {
          setWeakPointsError(
            err instanceof Error ? err.message : 'No se pudieron cargar tus puntos débiles.',
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingWeakPoints(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setAttemptsHistory(null);
      setHistoryError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingHistory(true);
    setHistoryError(null);

    void (async () => {
      try {
        const items = await getAttemptsHistory();
        if (!cancelled) {
          setAttemptsHistory(items);
        }
      } catch (err) {
        if (!cancelled) {
          setHistoryError(
            err instanceof Error ? err.message : 'No se pudo cargar tu historial de simulacros.',
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

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

  const handleRetryWeakPoints = async () => {
    if (!weakPoints || weakPoints.failedQuestionIds.length === 0 || isStartingWeakRetry) {
      return;
    }

    setIsStartingWeakRetry(true);
    setWeakPointsError(null);

    try {
      const localBank = await db.questions.toArray();
      const sourceBank = localBank.length > 0 ? localBank : await fetchQuestions({ faculty: 'ficct' });
      const started = startSimulation(sourceBank, {
        mode: 'retry',
        failedQuestionIds: weakPoints.failedQuestionIds,
      });

      if (!started) {
        setWeakPointsError('Descargá el banco o intentá de nuevo para repasar tus puntos débiles.');
        return;
      }

      navigate('/simulation');
    } catch (err) {
      setWeakPointsError(
        err instanceof Error ? err.message : 'No se pudo iniciar el repaso de puntos débiles.',
      );
    } finally {
      setIsStartingWeakRetry(false);
    }
  };

  const handleAskRecommendations = async () => {
    if (isLoadingRecommendations) return;

    setIsLoadingRecommendations(true);
    setRecommendationsError(null);

    try {
      const data = await getStudyRecommendations();
      setRecommendations(data);
    } catch (err) {
      setRecommendationsError(
        err instanceof Error ? err.message : 'No se pudo generar tu plan de estudio.',
      );
    } finally {
      setIsLoadingRecommendations(false);
    }
  };

  const greeting = user?.name ? `Hola, ${user.name}` : 'Bienvenido, Invitado';
  const subtitle = user?.email ?? 'Tus intentos se guardan solo en este dispositivo.';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 py-8">
      <div className="max-w-lg w-full space-y-5">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
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
                para no perder tu historial ni tus estadísticas.
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
              <div className="space-y-2.5">
                <Link
                  to="/simulation?mode=official"
                  className="block text-center w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3 px-4 rounded-xl transition-colors shadow-md"
                >
                  Simulacro Oficial CUP (40 preg · 60 min)
                </Link>
                <Link
                  to="/simulation?mode=practice"
                  className="block text-center w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold py-2.5 px-4 rounded-xl transition-colors text-sm"
                >
                  Práctica Personalizada por materia
                </Link>
              </div>
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

            <Link
              to="/history"
              className="mt-3 block text-center w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-3 px-4 rounded-xl transition-colors"
            >
              Ver mi historial de simulacros
            </Link>

            <Link
              to="/tutor"
              className="mt-3 block text-center w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold py-3 px-4 rounded-xl transition-colors"
            >
              Tutor IA por materia
            </Link>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="mt-3 w-full bg-white border border-slate-300 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-colors hover:bg-slate-50"
            >
              {user ? 'Cerrar sesión' : 'Salir del modo invitado'}
            </button>
          </div>
        </div>

        {user && (
          <section className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Mis Puntos Débiles</h2>
                <p className="text-xs text-slate-500">
                  Temas y preguntas con mayor tasa de error en tus simulacros
                </p>
              </div>
              {weakPoints && weakPoints.totalWrongAnswers > 0 && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  {weakPoints.failedQuestionIds.length} a reforzar
                </span>
              )}
            </div>

            {isLoadingWeakPoints && (
              <p className="text-sm text-slate-500">Analizando tu historial de respuestas…</p>
            )}

            {weakPointsError && (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
                {weakPointsError}
              </p>
            )}

            {!isLoadingWeakPoints && !weakPointsError && weakPoints && weakPoints.byTopic.length === 0 && (
              <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                {weakPoints.totalAnswersAnalyzed === 0
                  ? 'Todavía no tenemos simulacros guardados en tu cuenta para detectar puntos débiles.'
                  : '¡Impecable! No registrás errores en tus intentos guardados.'}
              </p>
            )}

            {!isLoadingWeakPoints && weakPoints && weakPoints.byTopic.length > 0 && (
              <div className="space-y-4">
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Temas con mayor % de error
                  </h3>
                  {weakPoints.byTopic.slice(0, 5).map((topicItem) => (
                    <div key={`${topicItem.subjectCode}-${topicItem.topic}`} className="space-y-1">
                      <div className="flex items-center justify-between text-sm gap-2">
                        <span className="font-medium text-slate-800 truncate">
                          {topicItem.subjectName} · {topicItem.topic}
                        </span>
                        <span className="text-xs font-semibold text-rose-700 tabular-nums shrink-0">
                          {topicItem.wrongCount}/{topicItem.totalSeen} fallos ({topicItem.errorRate}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-rose-500"
                          style={{ width: `${Math.min(topicItem.errorRate, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {weakPoints.byQuestion.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Preguntas más falladas
                    </h3>
                    <div className="space-y-2">
                      {weakPoints.byQuestion.slice(0, 3).map((q) => (
                        <div
                          key={q.questionId}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">
                              {q.subjectName} · {q.topic}
                            </span>
                            <span className="font-semibold text-rose-700 tabular-nums">
                              {q.wrongCount} {q.wrongCount === 1 ? 'error' : 'errores'} ({q.errorRate}%)
                            </span>
                          </div>
                          <div className="text-slate-800 line-clamp-2">
                            <MarkdownRenderer content={q.statementMd} variant="inline" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {weakPoints.failedQuestionIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleRetryWeakPoints()}
                    disabled={isStartingWeakRetry}
                    className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-xl shadow-sm transition-colors cursor-pointer"
                  >
                    {isStartingWeakRetry
                      ? 'Preparando repaso...'
                      : `Repasar mis puntos débiles (${weakPoints.failedQuestionIds.length})`}
                  </button>
                )}
              </div>
            )}

            {!isLoadingWeakPoints && !weakPointsError && weakPoints && (
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => void handleAskRecommendations()}
                  disabled={isLoadingRecommendations}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-xl shadow-sm transition-colors cursor-pointer"
                >
                  {isLoadingRecommendations ? 'Generando plan de estudio…' : 'Pedir plan de estudio a la IA'}
                </button>

                {recommendationsError && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    {recommendationsError}
                  </p>
                )}

                {recommendations && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
                    <MarkdownRenderer content={recommendations.recommendationsMd} />
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {user && (
          <section className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Mi progreso</h2>
              <p className="text-xs text-slate-500">
                Evolución de tu porcentaje de aciertos a lo largo de tus simulacros
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">{attemptsHistory?.length ?? 0}</p>
                <p className="text-xs text-slate-500">Simulacros realizados</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">
                  {attemptsHistory && attemptsHistory.length > 0
                    ? `${(
                        attemptsHistory.reduce((sum, item) => sum + item.percentage, 0) /
                        attemptsHistory.length
                      ).toFixed(1)}%`
                    : '—'}
                </p>
                <p className="text-xs text-slate-500">Promedio general</p>
              </div>
            </div>

            {isLoadingHistory && (
              <p className="text-sm text-slate-500">Cargando tu historial de simulacros…</p>
            )}

            {historyError && (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
                {historyError}
              </p>
            )}

            {!isLoadingHistory && !historyError && (
              <AttemptHistoryChart data={attemptsHistory ?? []} />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
