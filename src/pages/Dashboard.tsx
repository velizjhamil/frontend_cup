import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Lock,
  PlayCircle,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { fetchQuestions, getAttemptsHistory, getStudyRecommendations, getWeakPoints } from '../api/client';
import { AttemptHistoryChart } from '../components/AttemptHistoryChart';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { getSessionUser, useSession } from '../lib/auth-client';
import { db } from '../lib/db';
import { useExamStore } from '../store/useExamStore';
import { useGuestStore } from '../store/useGuestStore';
import { useSimulationStore } from '../store/useSimulationStore';
import type { AttemptHistoryItem, RecommendationsData, WeakPointsData } from '../types/attempt';

/** Superficie base de todas las tarjetas: blanca, borde sutil y sombra mínima. */
const CARD_CLASSES =
  'rounded-2xl border border-slate-200/80 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]';

const PRIMARY_CTA_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors duration-200 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-secondary disabled:cursor-not-allowed disabled:opacity-60';

const SUBTLE_BUTTON_CLASSES =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-primary transition-colors duration-200 hover:border-secondary hover:bg-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-secondary/60 disabled:cursor-not-allowed disabled:opacity-60';

const ALERT_CLASSES = 'rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700';

function formatLastSynced(timestamp: number | null): string {
  if (!timestamp) return 'Nunca';
  return new Date(timestamp).toLocaleString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Barras de error en tonos ámbar/coral suaves: comunican "a reforzar" sin el
 * rojo saturado de alarma. El texto del porcentaje va en un tono oscuro
 * aparte para mantener contraste AA.
 */
function errorBarClass(errorRate: number): string {
  if (errorRate >= 70) return 'bg-orange-400/80';
  if (errorRate >= 40) return 'bg-amber-400/80';
  return 'bg-amber-300/80';
}

type KpiCardProps = {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
};

function KpiCard({ icon: Icon, label, value, hint, action }: KpiCardProps) {
  return (
    <div className={`${CARD_CLASSES} flex flex-col gap-3 p-4`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="text-2xl font-bold tracking-tight text-primary tabular-nums">{value}</p>
      {(hint || action) && (
        <div className="mt-auto flex items-center justify-between gap-2">
          {hint && <p className="min-w-0 truncate text-xs text-muted-foreground">{hint}</p>}
          {action}
        </div>
      )}
    </div>
  );
}

type SectionHeaderProps = {
  title: string;
  description: string;
  aside?: ReactNode;
};

function SectionHeader({ title, description, aside }: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {aside}
    </div>
  );
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

  const { isSyncing, lastSynced, questionCount, error, syncBank, loadLocalCount } = useExamStore();
  const startSimulation = useSimulationStore((state) => state.startSimulation);
  const isSimulationRunning = useSimulationStore((state) => state.status === 'running');

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


  const firstName = user?.name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hola, ${firstName}` : 'Hola, Invitado';
  const subtitle = user
    ? 'Este es tu resumen de preparación para el CUP.'
    : 'Tus intentos se guardan solo en este dispositivo.';
  const hasBank = questionCount > 0;
  const averagePercentage =
    attemptsHistory && attemptsHistory.length > 0
      ? `${(
          attemptsHistory.reduce((sum, item) => sum + item.percentage, 0) / attemptsHistory.length
        ).toFixed(1)}%`
      : '—';
  const topicsToReinforce = weakPoints?.failedQuestionIds.length ?? 0;
  const accountOnlyHint = (
    <span className="inline-flex items-center gap-1">
      <Lock className="h-3 w-3" aria-hidden="true" /> Requiere cuenta
    </span>
  );

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* 1. Bienvenida + CTA principal */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
              {greeting}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {isSimulationRunning ? (
            <Link to="/simulation" className={`${PRIMARY_CTA_CLASSES} shrink-0`}>
              <PlayCircle className="h-5 w-5" aria-hidden="true" />
              Continuar simulacro en curso
            </Link>
          ) : hasBank ? (
            <Link to="/simulation?mode=official" className={`${PRIMARY_CTA_CLASSES} shrink-0`}>
              <PlayCircle className="h-5 w-5" aria-hidden="true" />
              Simulacro Oficial CUP
              <span className="font-normal text-secondary">(40 preg · 60 min)</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void syncBank()}
              disabled={isSyncing}
              className={`${PRIMARY_CTA_CLASSES} shrink-0`}
            >
              <Database className="h-5 w-5" aria-hidden="true" />
              {isSyncing ? 'Descargando banco…' : 'Descargar banco para empezar'}
            </button>
          )}
        </header>

        {isGuest && !user && (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <p>Estás como invitado: tu historial y tus estadísticas no se guardan en la nube.</p>
            <Link to="/login" className="shrink-0 font-semibold underline underline-offset-2">
              Crear una cuenta
            </Link>
          </div>
        )}

        {/* 2. KPIs */}
        <section aria-label="Indicadores" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={TrendingUp}
            label="Promedio de aciertos"
            value={user ? (isLoadingHistory ? '…' : averagePercentage) : '—'}
            hint={user ? 'En todos tus simulacros' : accountOnlyHint}
          />
          <KpiCard
            icon={CheckCircle2}
            label="Simulacros realizados"
            value={user ? (isLoadingHistory ? '…' : (attemptsHistory?.length ?? 0)) : '—'}
            hint={user ? 'Guardados en tu cuenta' : accountOnlyHint}
          />
          <KpiCard
            icon={Target}
            label="Temas a reforzar"
            value={user ? (isLoadingWeakPoints ? '…' : topicsToReinforce) : '—'}
            hint={
              user
                ? topicsToReinforce > 0
                  ? 'Preguntas falladas para repasar'
                  : 'Sin errores pendientes'
                : accountOnlyHint
            }
          />
          <KpiCard
            icon={Database}
            label="Banco offline"
            value={
              <>
                {questionCount}
                <span className="ml-1 text-sm font-medium text-muted-foreground">preguntas</span>
              </>
            }
            hint={
              error ? (
                <span className="text-rose-700">{error}</span>
              ) : (
                `Sincronizado: ${formatLastSynced(lastSynced)}`
              )
            }
            action={
              <button
                type="button"
                onClick={() => void syncBank()}
                disabled={isSyncing}
                className={`${SUBTLE_BUTTON_CLASSES} shrink-0`}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                {isSyncing ? 'Sincronizando' : hasBank ? 'Actualizar' : 'Descargar'}
              </button>
            }
          />
        </section>

        {/* 3. Grilla principal */}
        {user ? (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            <section className={`${CARD_CLASSES} space-y-5 p-5 md:p-6 lg:col-span-7`}>
              <SectionHeader
                title="Mi progreso"
                description="Porcentaje de aciertos por simulacro, del más antiguo al más reciente"
              />
              {isLoadingHistory && (
                <p className="text-sm text-muted-foreground">Cargando tu historial de simulacros…</p>
              )}
              {historyError && <p className={ALERT_CLASSES}>{historyError}</p>}
              {!isLoadingHistory && !historyError && <AttemptHistoryChart data={attemptsHistory ?? []} />}
            </section>

            <section className={`${CARD_CLASSES} space-y-5 p-5 md:p-6 lg:col-span-5`}>
              <SectionHeader
                title="Mis Puntos Débiles"
                description="Temas con mayor tasa de error en tus simulacros"
                aside={
                  topicsToReinforce > 0 ? (
                    <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                      {topicsToReinforce} a reforzar
                    </span>
                  ) : undefined
                }
              />

              {isLoadingWeakPoints && (
                <p className="text-sm text-muted-foreground">Analizando tu historial de respuestas…</p>
              )}
              {weakPointsError && <p className={ALERT_CLASSES}>{weakPointsError}</p>}

              {!isLoadingWeakPoints && !weakPointsError && weakPoints && weakPoints.byTopic.length === 0 && (
                <p className="rounded-xl bg-muted px-4 py-3 text-sm text-slate-600">
                  {weakPoints.totalAnswersAnalyzed === 0
                    ? 'Todavía no hay simulacros guardados en tu cuenta para detectar puntos débiles.'
                    : '¡Impecable! No registrás errores en tus intentos guardados.'}
                </p>
              )}

              {!isLoadingWeakPoints && weakPoints && weakPoints.byTopic.length > 0 && (
                <>
                  <ul className="space-y-3.5">
                    {weakPoints.byTopic.slice(0, 5).map((topicItem) => (
                      <li key={`${topicItem.subjectCode}-${topicItem.topic}`} className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate">
                            <span className="font-medium text-slate-800">{topicItem.topic}</span>
                            <span className="text-muted-foreground"> · {topicItem.subjectName}</span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-orange-800 tabular-nums">
                            {topicItem.errorRate}%
                            <span className="ml-1 font-normal text-muted-foreground">
                              ({topicItem.wrongCount}/{topicItem.totalSeen})
                            </span>
                          </span>
                        </div>
                        <div
                          className="h-1.5 overflow-hidden rounded-full bg-slate-100"
                          role="meter"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={topicItem.errorRate}
                          aria-label={`Error en ${topicItem.topic}`}
                        >
                          <div
                            className={`h-full rounded-full ${errorBarClass(topicItem.errorRate)}`}
                            style={{ width: `${Math.min(topicItem.errorRate, 100)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>

                  {weakPoints.byQuestion.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-medium text-muted-foreground">Preguntas más falladas</h3>
                      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200/80">
                        {weakPoints.byQuestion.slice(0, 3).map((q) => (
                          <li key={q.questionId} className="space-y-1 px-3 py-2.5 text-sm">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate font-medium text-primary">
                                {q.subjectName} · {q.topic}
                              </span>
                              <span className="shrink-0 text-orange-800 tabular-nums">
                                {q.wrongCount} {q.wrongCount === 1 ? 'error' : 'errores'}
                              </span>
                            </div>
                            <div className="line-clamp-2 text-slate-700">
                              <MarkdownRenderer content={q.statementMd} variant="inline" />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {weakPoints.failedQuestionIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleRetryWeakPoints()}
                      disabled={isStartingWeakRetry}
                      className={`${PRIMARY_CTA_CLASSES} w-full`}
                    >
                      <Target className="h-4 w-4" aria-hidden="true" />
                      {isStartingWeakRetry
                        ? 'Preparando repaso…'
                        : `Repasar mis puntos débiles (${weakPoints.failedQuestionIds.length})`}
                    </button>
                  )}
                </>
              )}

              {!isLoadingWeakPoints && !weakPointsError && weakPoints && (
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => void handleAskRecommendations()}
                    disabled={isLoadingRecommendations}
                    className={`${SUBTLE_BUTTON_CLASSES} w-full py-2.5 text-sm`}
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    {isLoadingRecommendations ? 'Generando plan de estudio…' : 'Pedir plan de estudio a la IA'}
                  </button>
                  {recommendationsError && <p className={ALERT_CLASSES}>{recommendationsError}</p>}
                  {recommendations && (
                    <div className="rounded-xl bg-muted/70 p-4 text-sm">
                      <MarkdownRenderer content={recommendations.recommendationsMd} />
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        ) : (
          <section
            className={`${CARD_CLASSES} flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between`}
          >
            <div>
              <h2 className="text-base font-semibold text-slate-900">Progreso y puntos débiles</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Con una cuenta ves tu evolución, los temas a reforzar y un plan de estudio con IA.
              </p>
            </div>
            <Link to="/login" className={`${SUBTLE_BUTTON_CLASSES} shrink-0 px-4 py-2 text-sm`}>
              Iniciar sesión
            </Link>
          </section>
        )}

        {/* 4. Acción rápida secundaria */}
        <section className={`${CARD_CLASSES} flex flex-col gap-4 p-5 sm:flex-row sm:items-center`}>
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900">Práctica Personalizada por materia</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Elegí materia, cantidad de preguntas y dificultad para entrenar a tu ritmo.
            </p>
          </div>
          {hasBank ? (
            <Link to="/simulation?mode=practice" className={`${SUBTLE_BUTTON_CLASSES} shrink-0 px-4 py-2 text-sm`}>
              Configurar práctica
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <p className="shrink-0 text-xs text-muted-foreground">Descargá el banco para practicar.</p>
          )}
        </section>
      </div>
    </div>
  );
}
