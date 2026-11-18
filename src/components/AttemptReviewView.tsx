import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchQuestions } from '../api/client';
import { AiTutorChat } from './AiTutorChat';
import { Button } from './Button';
import { MarkdownRenderer } from './MarkdownRenderer';
import { db } from '../lib/db';
import type { ExamQuestion } from '../lib/examGenerator';
import { useSimulationStore } from '../store/useSimulationStore';
import type { AttemptResultData, QuestionCorrectionItem } from '../types/attempt';

function getDurationLabel(startIso: string, endIso: string): string {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return '—';

  const totalSeconds = Math.max(Math.floor((endMs - startMs) / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function buildFallbackExamQuestion(item: QuestionCorrectionItem): ExamQuestion {
  return {
    id: item.questionId,
    facultyId: 'ficct',
    subjectId: item.subjectId,
    topic: item.topic,
    statementMd: item.statementMd,
    imageUrl: item.imageUrl,
    options: item.options.map((opt) => ({ key: opt.key, text: opt.text })),
    difficulty: item.difficulty,
  };
}

function findOptionText(question: ExamQuestion, key: string | null): string | null {
  if (!key) return null;
  const normalized = key.trim().toUpperCase();
  const match = question.options.find((opt) => opt.key.trim().toUpperCase() === normalized);
  return match?.text ?? null;
}

function AnswerRow({
  label,
  optionKey,
  optionText,
  tone,
}: {
  label: string;
  optionKey: string | null;
  optionText: string | null;
  tone: 'neutral' | 'correct' | 'wrong' | 'empty';
}) {
  const toneClass =
    tone === 'correct'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
      : tone === 'wrong'
        ? 'bg-rose-50 border-rose-200 text-rose-900'
        : tone === 'empty'
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-slate-50 border-slate-200 text-slate-800';

  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${toneClass}`}>
      <span className="text-xs font-semibold uppercase tracking-wide opacity-75 block mb-0.5">
        {label}
      </span>
      {optionKey ? (
        <div className="flex items-start gap-2">
          <strong className="shrink-0">{optionKey})</strong>
          {optionText ? (
            <MarkdownRenderer content={optionText} variant="inline" />
          ) : (
            <span>Opción {optionKey}</span>
          )}
        </div>
      ) : (
        <span className="italic">Sin responder</span>
      )}
    </div>
  );
}

function ReviewCard({
  item,
  index,
  question,
}: {
  item: QuestionCorrectionItem;
  index: number;
  question: ExamQuestion;
}) {
  const userOptionText = findOptionText(question, item.selectedKey);
  const correctOptionText = findOptionText(question, item.correctKey);

  const badge = item.isCorrect
    ? { text: 'Correcta', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
    : item.selectedKey === null
      ? { text: 'Sin responder', className: 'bg-amber-100 text-amber-800 border-amber-200' }
      : { text: 'Incorrecta', className: 'bg-rose-100 text-rose-800 border-rose-200' };

  return (
    <article className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">Pregunta {index + 1}</span>
          <span>·</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {item.subjectName}
          </span>
          {question.topic && (
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {question.topic}
            </span>
          )}
        </div>

        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${badge.className}`}>
          {badge.text}
        </span>
      </div>

      <MarkdownRenderer content={question.statementMd} className="text-slate-900" />

      <div className="grid gap-2 sm:grid-cols-2">
        <AnswerRow
          label="Tu respuesta"
          optionKey={item.selectedKey}
          optionText={userOptionText}
          tone={item.isCorrect ? 'correct' : item.selectedKey === null ? 'empty' : 'wrong'}
        />
        <AnswerRow
          label="Respuesta correcta"
          optionKey={item.correctKey}
          optionText={correctOptionText}
          tone="correct"
        />
      </div>

      {(item.explanationMd || item.procedureMd) && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-sm text-slate-800">
          {item.explanationMd && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Explicación
              </p>
              <MarkdownRenderer content={item.explanationMd} />
            </div>
          )}

          {item.procedureMd && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Procedimiento paso a paso
              </p>
              <MarkdownRenderer content={item.procedureMd} />
            </div>
          )}
        </div>
      )}

      <AiTutorChat
        questionId={item.questionId}
        selectedKey={item.selectedKey}
        isCorrect={item.isCorrect}
      />
    </article>
  );
}

type AttemptReviewViewProps = {
  evaluation: AttemptResultData;
  questions?: readonly ExamQuestion[];
  headerSubtitle?: string;
  secondaryAction?: ReactNode;
};

/**
 * Vista compartida entre `/results` (resultado inmediato) y `/history/:id`
 * (detalle histórico): cabecera de nota, desglose por materia, repaso de
 * errores (`retry`) y tarjetas pregunta por pregunta.
 */
export function AttemptReviewView({
  evaluation,
  questions = [],
  headerSubtitle = 'Resultado oficial del simulacro',
  secondaryAction,
}: AttemptReviewViewProps) {
  const navigate = useNavigate();
  const startSimulation = useSimulationStore((state) => state.startSimulation);
  const [isStartingRetry, setIsStartingRetry] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const fallbackQuestions = evaluation.results.map(buildFallbackExamQuestion);
  const questionMap = new Map<string, ExamQuestion>();
  for (const fallback of fallbackQuestions) {
    questionMap.set(fallback.id, fallback);
  }
  for (const item of questions) {
    questionMap.set(item.id, item);
  }

  const failedQuestionIds = evaluation.results
    .filter((item) => !item.isCorrect || item.selectedKey === null)
    .map((item) => item.questionId);
  const isApproved = evaluation.score >= 20 || evaluation.percentage >= 50;
  const durationLabel = getDurationLabel(evaluation.startTime, evaluation.endTime);

  const handleRetryErrors = async () => {
    if (failedQuestionIds.length === 0 || isStartingRetry) {
      return;
    }

    setIsStartingRetry(true);
    setRetryError(null);

    try {
      const localBank = await db.questions.toArray();
      const sourceBank =
        localBank.length > 0
          ? [...localBank, ...questions, ...fallbackQuestions]
          : questions.length > 0
            ? [...questions, ...fallbackQuestions]
            : await fetchQuestions({ faculty: 'ficct' }).catch(() => fallbackQuestions);

      const started = startSimulation(
        sourceBank.length > 0 ? sourceBank : fallbackQuestions,
        {
          mode: 'retry',
          failedQuestionIds,
        },
      );

      if (!started) {
        setRetryError('No se encontraron preguntas disponibles para repasar.');
        return;
      }

      navigate('/simulation');
    } catch {
      setRetryError('No se pudo preparar el repaso de errores.');
    } finally {
      setIsStartingRetry(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        <section className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className={`p-6 text-center text-white ${isApproved ? 'bg-emerald-600' : 'bg-rose-600'}`}>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-90">
              {headerSubtitle}
            </p>
            <h1 className="text-2xl font-bold mt-1">
              {isApproved ? '¡Aprobaste!' : 'Seguí practicando'}
            </h1>
            <p className="text-4xl font-extrabold mt-3 tabular-nums">
              {evaluation.score}{' '}
              <span className="text-xl font-semibold opacity-85">/ {evaluation.totalQuestions}</span>
            </p>
            <p className="text-sm mt-1 opacity-90">{evaluation.percentage}% de aciertos</p>
          </div>

          <div className="p-6 space-y-5">
            <dl className="grid grid-cols-3 gap-2 text-center bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Respondidas</dt>
                <dd className="font-bold text-slate-900 mt-0.5">{evaluation.answeredCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Sin responder</dt>
                <dd className="font-bold text-slate-900 mt-0.5">{evaluation.unansweredCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Tiempo</dt>
                <dd className="font-bold text-slate-900 mt-0.5 font-mono">{durationLabel}</dd>
              </div>
            </dl>

            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Desglose por materia</h2>
              <div className="space-y-2.5">
                {evaluation.bySubject.map((subject) => {
                  const passedSubject = subject.percentage >= 50;

                  return (
                    <div key={subject.subjectId} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-800">{subject.subjectName}</span>
                        <span className="text-slate-600 tabular-nums">
                          <strong>{subject.correct}</strong>/{subject.total} ({subject.percentage}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            passedSubject ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${Math.min(subject.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {failedQuestionIds.length > 0 && (
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => void handleRetryErrors()}
                  disabled={isStartingRetry}
                  className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-xl shadow-sm transition-colors cursor-pointer"
                >
                  {isStartingRetry
                    ? 'Preparando repaso...'
                    : `Repasar mis errores (${failedQuestionIds.length} ${failedQuestionIds.length === 1 ? 'pregunta' : 'preguntas'})`}
                </button>
                {retryError && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-center">
                    {retryError}
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2 pt-1">
              <Button type="button" onClick={() => navigate('/simulation')}>
                Nuevo simulacro
              </Button>
              {secondaryAction ?? (
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="w-full bg-white border border-slate-300 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-colors hover:bg-slate-50"
                >
                  Volver al dashboard
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-base font-bold text-slate-900 px-1">
            Revisión de respuestas ({evaluation.results.length})
          </h2>

          {evaluation.results.map((item, index) => (
            <ReviewCard
              key={item.questionId}
              item={item}
              index={index}
              question={questionMap.get(item.questionId) ?? buildFallbackExamQuestion(item)}
            />
          ))}
        </section>
      </div>
    </div>
  );
}
