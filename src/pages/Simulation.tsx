import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import {
  OFFICIAL_EXAM_MINUTES,
  OFFICIAL_EXAM_SECONDS,
  OFFICIAL_EXAM_SIZE,
} from '../lib/examGenerator';
import { db } from '../lib/db';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { useSimulationStore } from '../store/useSimulationStore';
import type { Question } from '../types/question';

/** `2400` → `"40:00"`. */
function formatTime(totalSeconds: number): string {
  const safe = Math.max(totalSeconds, 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Pantalla 5 de docs/PRODUCT.md: rendir el simulacro.
 *
 * Una pregunta por pantalla + mapa de 40 botones: en un examen largo hay que
 * poder saltar a la pregunta 12 desde la 38 sin scrollear, y ver de un vistazo
 * cuáles quedaron sin responder.
 */
export default function Simulation() {
  const status = useSimulationStore((state) => state.status);
  const isHydrated = useSimulationStore((state) => state.isHydrated);
  const questions = useSimulationStore((state) => state.questions);
  const answers = useSimulationStore((state) => state.answers);
  const timeRemaining = useSimulationStore((state) => state.timeRemaining);
  const startSimulation = useSimulationStore((state) => state.startSimulation);
  const answerQuestion = useSimulationStore((state) => state.answerQuestion);
  const finishSimulation = useSimulationStore((state) => state.finishSimulation);
  const tickTimer = useSimulationStore((state) => state.tickTimer);
  const resetSimulation = useSimulationStore((state) => state.resetSimulation);

  const [bank, setBank] = useState<Question[]>([]);
  const [isBankLoading, setIsBankLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isConfirmingFinish, setIsConfirmingFinish] = useState(false);

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

  const safeIndex = questions.length > 0 ? Math.min(currentIndex, questions.length - 1) : 0;
  const question = questions[safeIndex];
  const answeredCount = questions.filter((item) => answers[item.id] !== undefined).length;
  const unansweredCount = questions.length - answeredCount;
  const isLowTime = timeRemaining <= 5 * 60;
  const usedSeconds = OFFICIAL_EXAM_SECONDS - timeRemaining;
  const shortBank = bank.length > 0 && bank.length < OFFICIAL_EXAM_SIZE;

  const handleStart = () => {
    if (!startSimulation(bank)) return;

    setCurrentIndex(0);
    setIsConfirmingFinish(false);
  };

  const handleRestart = () => {
    resetSimulation();
    setCurrentIndex(0);
    setIsConfirmingFinish(false);
  };

  // Antes de hidratar no se sabe si hay un simulacro guardado: mostrar la
  // pantalla de inicio acá haría parpadear "Iniciar" sobre un examen en curso.
  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <p className="text-sm text-slate-600">Restaurando simulacro…</p>
      </div>
    );
  }

  if (status === 'idle') {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-blue-600 p-6 text-center">
            <h1 className="text-2xl font-bold text-white">Simulacro oficial</h1>
            <p className="text-blue-100 text-sm mt-1">
              {OFFICIAL_EXAM_SIZE} preguntas · {OFFICIAL_EXAM_MINUTES} minutos
            </p>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Tenés {OFFICIAL_EXAM_MINUTES} minutos para {OFFICIAL_EXAM_SIZE} preguntas. No podrás
              pausar.
            </p>

            {isBankLoading && <p className="text-sm text-slate-600">Leyendo el banco guardado…</p>}

            {!isBankLoading && bank.length === 0 && (
              <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
                No hay preguntas en este dispositivo. Descargá el banco antes de empezar.
              </p>
            )}

            {!isBankLoading && shortBank && (
              <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
                El banco guardado tiene {bank.length} preguntas, así que el simulacro tendrá{' '}
                {Math.min(bank.length, OFFICIAL_EXAM_SIZE)} y no {OFFICIAL_EXAM_SIZE}.
              </p>
            )}

            <Button type="button" onClick={handleStart} disabled={isBankLoading || bank.length === 0}>
              Iniciar Simulacro Oficial
            </Button>

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
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-blue-600 p-6 text-center">
            <h1 className="text-2xl font-bold text-white">Simulacro terminado</h1>
            <p className="text-blue-100 text-sm mt-1">Calculando resultados…</p>
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

            <p className="text-xs text-slate-500">
              El puntaje se calcula en el servidor (Fase 5). Lo de arriba es solo lo que quedó
              registrado en este dispositivo.
            </p>

            <Button type="button" onClick={handleRestart}>
              Volver a empezar
            </Button>

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

  if (!question) return null;

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p
              className={`font-mono text-2xl font-bold tabular-nums ${
                isLowTime ? 'text-red-600' : 'text-slate-900'
              }`}
            >
              {formatTime(timeRemaining)}
            </p>
            <p className="text-xs text-slate-500">
              Respondidas {answeredCount} de {questions.length}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsConfirmingFinish(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Finalizar
          </button>
        </div>

        <div className="h-1 bg-slate-200">
          <div
            className="h-1 bg-blue-600 transition-all"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-5 space-y-4">
        <article className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
            <span>
              Pregunta {safeIndex + 1} de {questions.length}
            </span>
            {question.topic && (
              <span className="px-2 py-0.5 rounded-full bg-slate-100">{question.topic}</span>
            )}
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
                  className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                    isChecked ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name={question.id}
                    value={option.key}
                    checked={isChecked}
                    onChange={() => answerQuestion(question.id, option.key)}
                    className="mt-1 accent-blue-600"
                  />
                  <div className="flex-1 min-w-0 text-sm text-slate-800">
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
            className="flex-1 bg-white border border-slate-300 text-slate-700 font-semibold py-3 rounded-xl transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => setCurrentIndex(Math.min(safeIndex + 1, questions.length - 1))}
            disabled={safeIndex === questions.length - 1}
            className="flex-1 bg-white border border-slate-300 text-slate-700 font-semibold py-3 rounded-xl transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Siguiente
          </button>
        </div>

        <nav aria-label="Mapa de preguntas" className="grid grid-cols-8 gap-1.5">
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
                className={`h-8 rounded-md text-xs font-semibold border transition-colors ${
                  isCurrent ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                } ${
                  isAnswered
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
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
                className="w-full bg-white border border-slate-300 text-slate-700 font-semibold py-3 rounded-xl transition-colors hover:bg-slate-50"
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
