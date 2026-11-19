import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { submitAttempt } from '../api/client';
import { Button } from '../components/Button';
import {
  filterPracticeBank,
  getSubjectLabel,
  getSubjectNameByCode,
  OFFICIAL_EXAM_MINUTES,
  OFFICIAL_EXAM_SIZE,
  PRACTICE_SECONDS_PER_QUESTION,
  SUBJECT_CATALOG,
  type ExamDifficulty,
  type PracticeCount,
  type SubjectCode,
} from '../lib/examGenerator';
import { db } from '../lib/db';
import { queuePendingAttempt } from '../lib/offlineSync';
import { clearPersistedSimulation } from '../lib/simulationPersistence';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { useSimulationStore } from '../store/useSimulationStore';
import type { Question } from '../types/question';

/** `3600` → `"60:00"`. */
function formatTime(totalSeconds: number): string {
  const safe = Math.max(totalSeconds, 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDurationText(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

const PRACTICE_COUNTS: readonly PracticeCount[] = [5, 10, 15];
const DIFFICULTY_OPTIONS: ReadonlyArray<{ value: '' | ExamDifficulty; label: string }> = [
  { value: '', label: 'Todas las dificultades' },
  { value: 'easy', label: 'Fácil' },
  { value: 'medium', label: 'Media' },
  { value: 'hard', label: 'Difícil' },
];

/**
 * Pantalla 5 de docs/PRODUCT.md: rendir el simulacro.
 *
 * Una pregunta por pantalla + mapa de 40 botones: en un examen largo hay que
 * poder saltar a la pregunta 12 desde la 38 sin scrollear, y ver de un vistazo
 * cuáles quedaron sin responder.
 */
export default function Simulation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const status = useSimulationStore((state) => state.status);
  const examTitle = useSimulationStore((state) => state.examTitle);
  const durationSeconds = useSimulationStore((state) => state.durationSeconds);
  const isHydrated = useSimulationStore((state) => state.isHydrated);
  const questions = useSimulationStore((state) => state.questions);
  const answers = useSimulationStore((state) => state.answers);
  const startTime = useSimulationStore((state) => state.startTime);
  const timeRemaining = useSimulationStore((state) => state.timeRemaining);
  const startSimulation = useSimulationStore((state) => state.startSimulation);
  const answerQuestion = useSimulationStore((state) => state.answerQuestion);
  const finishSimulation = useSimulationStore((state) => state.finishSimulation);
  const tickTimer = useSimulationStore((state) => state.tickTimer);
  const setLastResult = useSimulationStore((state) => state.setLastResult);
  const resetSimulation = useSimulationStore((state) => state.resetSimulation);

  const initialMode: 'official' | 'practice' =
    searchParams.get('mode') === 'practice' ? 'practice' : 'official';

  const [bank, setBank] = useState<Question[]>([]);
  const [isBankLoading, setIsBankLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState<'official' | 'practice'>(initialMode);
  const [selectedSubject, setSelectedSubject] = useState<SubjectCode>('matematicas');
  const [selectedCount, setSelectedCount] = useState<PracticeCount>(10);
  const [selectedDifficulty, setSelectedDifficulty] = useState<'' | ExamDifficulty>('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isConfirmingFinish, setIsConfirmingFinish] = useState(false);
  const [isSubmittingResult, setIsSubmittingResult] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [wasQueuedOffline, setWasQueuedOffline] = useState(false);
  const hasSubmittedRef = useRef(false);

  // El banco vive en IndexedDB, no en el store: se lee una vez al entrar.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = await db.questions.toArray();
      if (cancelled) return;

      setBank(stored);
      setIsBankLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Un tick por segundo mientras se rinde. `tickTimer` recalcula desde
  // `startTime`, así que un intervalo perdido no descuenta mal.
  useEffect(() => {
    if (status !== 'running') return;

    const id = window.setInterval(tickTimer, 1000);
    return () => window.clearInterval(id);
  }, [status, tickTimer]);

  const sendAttempt = useCallback(async () => {
    if (questions.length === 0) return;

    setIsSubmittingResult(true);
    setSubmitError(null);

    const payload = {
      answers,
      questionIds: questions.map((item) => item.id),
      startTime: startTime ?? Date.now(),
      endTime: Date.now(),
    };

    try {
      if (!navigator.onLine) {
        // No se resetea el store ni se navega todavía: si lo hiciéramos acá,
        // `status` volvería a 'idle' y esta misma pantalla mostraría de
        // nuevo el formulario de "Configurar examen" en vez del aviso de
        // guardado offline. El reset queda para cuando el alumno confirme
        // "Ir al Dashboard".
        await queuePendingAttempt(payload);
        await clearPersistedSimulation();
        setWasQueuedOffline(true);
        return;
      }

      const evaluation = await submitAttempt(payload);

      setLastResult({ evaluation, questions });
      await clearPersistedSimulation();
      resetSimulation();
      navigate('/results', { replace: true, state: { evaluation, questions } });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo calificar el simulacro.';
      console.error('[simulación] Error al enviar el intento:', error);
      setSubmitError(message);
    } finally {
      setIsSubmittingResult(false);
    }
  }, [answers, navigate, questions, resetSimulation, setLastResult, startTime]);

  useEffect(() => {
    if (status !== 'finished') {
      hasSubmittedRef.current = false;
      return;
    }
    if (!isHydrated || questions.length === 0 || hasSubmittedRef.current) return;

    hasSubmittedRef.current = true;
    void sendAttempt();
  }, [isHydrated, questions.length, sendAttempt, status]);

  const safeIndex = questions.length > 0 ? Math.min(currentIndex, questions.length - 1) : 0;
  const question = questions[safeIndex];
  const answeredCount = questions.filter((item) => answers[item.id] !== undefined).length;
  const unansweredCount = questions.length - answeredCount;
  const isLowTime = timeRemaining <= 5 * 60;
  const usedSeconds = Math.max(durationSeconds - timeRemaining, 0);
  const shortBank = bank.length > 0 && bank.length < OFFICIAL_EXAM_SIZE;

  const matchingPracticeCount = filterPracticeBank(bank, {
    subject: selectedSubject,
    difficulty: selectedDifficulty || undefined,
  }).length;
  const practiceDurationSeconds = selectedCount * PRACTICE_SECONDS_PER_QUESTION;

  const handleStartOfficial = () => {
    setLastResult(null);
    setSubmitError(null);
    hasSubmittedRef.current = false;
    if (!startSimulation(bank, { mode: 'official' })) return;

    setCurrentIndex(0);
    setIsConfirmingFinish(false);
  };

  const handleStartPractice = () => {
    setLastResult(null);
    setSubmitError(null);
    hasSubmittedRef.current = false;
    if (
      !startSimulation(bank, {
        mode: 'practice',
        subject: selectedSubject,
        count: selectedCount,
        difficulty: selectedDifficulty || undefined,
        durationSeconds: practiceDurationSeconds,
      })
    ) {
      return;
    }

    setCurrentIndex(0);
    setIsConfirmingFinish(false);
  };

  const handleRestart = async () => {
    await clearPersistedSimulation();
    resetSimulation();
    setCurrentIndex(0);
    setIsConfirmingFinish(false);
    setSubmitError(null);
    hasSubmittedRef.current = false;
  };

  // Antes de hidratar no se sabe si hay un simulacro guardado: mostrar la
  // pantalla de inicio acá haría parpadear "Iniciar" sobre un examen en curso.
  if (!isHydrated) {
    return (
      <div className="min-h-full bg-background flex items-center justify-center p-4">
        <p className="text-sm text-slate-600">Restaurando simulacro…</p>
      </div>
    );
  }

  if (status === 'idle') {
    const selectedSubjectName = getSubjectNameByCode(selectedSubject);

    return (
      <div className="min-h-full bg-background flex flex-col items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-primary p-6 text-center">
            <h1 className="text-2xl font-bold text-white">Configurar examen</h1>
            <p className="text-primary-foreground/80 text-sm mt-1">
              Elegí el Simulacro Oficial o una Práctica Personalizada
            </p>
          </div>

          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setSelectedMode('official')}
                className={`rounded-lg py-2 px-3 text-sm font-semibold transition-colors duration-200 ${
                  selectedMode === 'official'
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Simulacro Oficial
              </button>
              <button
                type="button"
                onClick={() => setSelectedMode('practice')}
                className={`rounded-lg py-2 px-3 text-sm font-semibold transition-colors duration-200 ${
                  selectedMode === 'practice'
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Práctica Personalizada
              </button>
            </div>

            {isBankLoading && <p className="text-sm text-slate-600">Leyendo el banco guardado…</p>}

            {!isBankLoading && bank.length === 0 && (
              <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
                No hay preguntas en este dispositivo. Descargá el banco desde el dashboard antes de
                empezar.
              </p>
            )}

            {selectedMode === 'official' ? (
              <div className="space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Simulacro Oficial CUP · FICCT</p>
                  <ul className="space-y-1 text-slate-600">
                    <li>• {OFFICIAL_EXAM_SIZE} preguntas (10 por materia)</li>
                    <li>• Ordenadas por bloques de materia (Matemáticas, Física, Computación, Inglés)</li>
                    <li>• {OFFICIAL_EXAM_MINUTES} minutos (1 hora) sin pausa</li>
                  </ul>
                </div>

                {!isBankLoading && shortBank && (
                  <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    El banco guardado tiene {bank.length} preguntas, así que el simulacro tendrá{' '}
                    {Math.min(bank.length, OFFICIAL_EXAM_SIZE)} y no {OFFICIAL_EXAM_SIZE}.
                  </p>
                )}

                <Button
                  type="button"
                  onClick={handleStartOfficial}
                  disabled={isBankLoading || bank.length === 0}
                >
                  Iniciar Simulacro Oficial
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Materia</span>
                  <select
                    value={selectedSubject}
                    onChange={(event) => setSelectedSubject(event.target.value as SubjectCode)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-primary focus:ring-4 focus:ring-secondary/50"
                  >
                    {SUBJECT_CATALOG.map((subject) => (
                      <option key={subject.code} value={subject.code}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div>
                  <span className="text-sm font-medium text-slate-700 block mb-1.5">
                    Cantidad de preguntas
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {PRACTICE_COUNTS.map((count) => {
                      const active = selectedCount === count;
                      return (
                        <button
                          key={count}
                          type="button"
                          onClick={() => setSelectedCount(count)}
                          className={`rounded-xl border py-2.5 px-3 text-sm font-semibold transition-colors duration-200 ${
                            active
                              ? 'border-primary bg-muted text-primary'
                              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {count} preg
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">
                    Tiempo estimado: {formatDurationText(practiceDurationSeconds)} (1.5 min por
                    pregunta)
                  </p>
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    Dificultad (opcional)
                  </span>
                  <select
                    value={selectedDifficulty}
                    onChange={(event) =>
                      setSelectedDifficulty(event.target.value as '' | ExamDifficulty)
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-primary focus:ring-4 focus:ring-secondary/50"
                  >
                    {DIFFICULTY_OPTIONS.map((opt) => (
                      <option key={opt.label} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                {!isBankLoading && bank.length > 0 && matchingPracticeCount === 0 && (
                  <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    No hay preguntas de {selectedSubjectName} con esa dificultad en tu banco local.
                    Probá con "Todas las dificultades".
                  </p>
                )}

                {!isBankLoading &&
                  matchingPracticeCount > 0 &&
                  matchingPracticeCount < selectedCount && (
                    <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
                      Hay {matchingPracticeCount} preguntas disponibles con ese filtro (en vez de{' '}
                      {selectedCount}).
                    </p>
                  )}

                <Button
                  type="button"
                  onClick={handleStartPractice}
                  disabled={isBankLoading || matchingPracticeCount === 0}
                >
                  Iniciar Práctica de {selectedSubjectName}
                </Button>
              </div>
            )}

            <p className="text-xs text-center text-slate-500">
              <Link to="/dashboard" className="hover:underline">
                Volver al dashboard
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'finished') {
    return (
      <div className="min-h-full bg-background flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-primary p-6 text-center">
            <h1 className="text-2xl font-bold text-white">Simulacro terminado</h1>
            <p className="text-primary-foreground/80 text-sm mt-1">
              {wasQueuedOffline
                ? 'Guardado para enviar cuando vuelva la conexión'
                : isSubmittingResult
                  ? 'Calificando tu simulacro en el servidor…'
                  : submitError
                    ? 'No pudimos calificar tu intento'
                    : 'Preparando tus resultados…'}
            </p>
          </div>

          <div className="p-6 space-y-4">
            <dl className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
              <div className="flex justify-between">
                <dt>Respondidas</dt>
                <dd className="font-semibold">
                  {answeredCount} de {questions.length}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Sin responder</dt>
                <dd className="font-semibold">{unansweredCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Tiempo usado</dt>
                <dd className="font-semibold">{formatTime(usedSeconds)}</dd>
              </div>
            </dl>

            {wasQueuedOffline && (
              <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-3">
                <p>
                  Sin conexión: tu intento se guardó en este dispositivo y se enviará
                  automáticamente cuando vuelva internet.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    resetSimulation();
                    navigate('/dashboard');
                  }}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors duration-200"
                >
                  Ir al Dashboard
                </button>
              </div>
            )}

            {submitError && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                {submitError}
              </p>
            )}

            {submitError && (
              <Button
                type="button"
                onClick={() => void sendAttempt()}
                disabled={isSubmittingResult}
              >
                {isSubmittingResult ? 'Enviando…' : 'Reintentar calificación'}
              </Button>
            )}

            {!wasQueuedOffline && (
              <button
                type="button"
                onClick={() => void handleRestart()}
                disabled={isSubmittingResult}
                className="w-full bg-white border border-slate-300 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-colors duration-200 hover:bg-slate-50 disabled:opacity-50"
              >
                Descartar y volver a empezar
              </button>
            )}

            {!wasQueuedOffline && (
              <p className="text-xs text-center text-slate-500">
                <Link to="/dashboard" className="hover:underline">
                  Volver al dashboard
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!question) return null;

  return (
    <div className="min-h-full bg-background pb-10">
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-secondary/60 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-primary truncate">
              {examTitle}
            </p>
            <p
              role="timer"
              aria-live="off"
              className={`font-mono text-2xl sm:text-3xl font-bold tabular-nums leading-tight ${
                isLowTime ? 'text-red-600' : 'text-primary'
              }`}
            >
              {formatTime(timeRemaining)}
            </p>
            <p className="text-xs text-muted-foreground">
              Respondidas {answeredCount} de {questions.length}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsConfirmingFinish(true)}
            className="shrink-0 bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors duration-200"
          >
            Finalizar
          </button>
        </div>

        <div className="h-1 bg-muted">
          <div
            className="h-1 bg-primary transition-all"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-5 space-y-4">
        <article className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 mb-3">
            <span className="font-semibold text-slate-700">
              Pregunta {safeIndex + 1} de {questions.length}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-full bg-muted text-primary font-medium">
                {getSubjectLabel(question)}
              </span>
              {question.topic && (
                <span className="px-2 py-0.5 rounded-full bg-slate-100">{question.topic}</span>
              )}
            </div>
          </div>

          <MarkdownRenderer content={question.statementMd} className="text-slate-900" />

          {question.imageUrl && (
            <img
              src={question.imageUrl}
              alt=""
              className="mt-3 rounded-lg max-h-64 w-auto border border-slate-200"
            />
          )}

          <fieldset className="mt-5 space-y-2">
            <legend className="sr-only">Opciones de respuesta</legend>

            {question.options.map((option) => {
              const isChecked = answers[question.id] === option.key;

              return (
                <label
                  key={option.key}
                  className={`flex items-start gap-3 rounded-xl border-2 p-3.5 cursor-pointer transition-colors duration-200 ${
                    isChecked
                      ? 'border-primary bg-muted'
                      : 'border-secondary/60 hover:border-secondary hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="radio"
                    name={question.id}
                    value={option.key}
                    checked={isChecked}
                    onChange={() => answerQuestion(question.id, option.key)}
                    className="mt-1 h-4 w-4 shrink-0 accent-primary"
                  />
                  <div className="flex-1 min-w-0 break-words text-base sm:text-sm leading-relaxed text-slate-800">
                    <strong className="mr-2">{option.key}</strong>
                    <MarkdownRenderer content={option.text} variant="inline" />
                  </div>
                </label>
              );
            })}
          </fieldset>
        </article>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCurrentIndex(Math.max(safeIndex - 1, 0))}
            disabled={safeIndex === 0}
            className="flex-1 bg-white border border-slate-300 text-slate-700 font-semibold py-3 rounded-xl transition-colors duration-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => setCurrentIndex(Math.min(safeIndex + 1, questions.length - 1))}
            disabled={safeIndex === questions.length - 1}
            className="flex-1 bg-white border border-slate-300 text-slate-700 font-semibold py-3 rounded-xl transition-colors duration-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Siguiente
          </button>
        </div>

        <nav aria-label="Mapa de preguntas" className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
          {questions.map((item, index) => {
            const isAnswered = answers[item.id] !== undefined;
            const isCurrent = index === safeIndex;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentIndex(index)}
                aria-label={`Ir a la pregunta ${index + 1}${isAnswered ? ' (respondida)' : ''}`}
                aria-current={isCurrent ? 'true' : undefined}
                className={`h-9 rounded-lg text-xs font-semibold border transition-colors duration-200 ${
                  isCurrent ? 'ring-2 ring-primary ring-offset-1' : ''
                } ${
                  isAnswered
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'bg-card border-secondary text-slate-600 hover:bg-muted'
                }`}
              >
                {index + 1}
              </button>
            );
          })}
        </nav>
      </main>

      {isConfirmingFinish && (
        <div className="fixed inset-0 z-20 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">¿Finalizar el simulacro?</h2>
            <p className="text-sm text-slate-600 mt-2">
              {unansweredCount === 0
                ? 'Respondiste todas las preguntas.'
                : `Te quedan ${unansweredCount} preguntas sin responder.`}{' '}
              No se puede pausar ni volver atrás.
            </p>

            <div className="mt-5 space-y-2">
              <Button
                type="button"
                onClick={() => {
                  setIsConfirmingFinish(false);
                  finishSimulation();
                }}
              >
                Sí, finalizar
              </Button>
              <button
                type="button"
                onClick={() => setIsConfirmingFinish(false)}
                className="w-full bg-white border border-slate-300 text-slate-700 font-semibold py-3 rounded-xl transition-colors duration-200 hover:bg-slate-50"
              >
                Seguir rindiendo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
