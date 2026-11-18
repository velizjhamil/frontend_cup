import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AttemptResultData } from '../types/attempt';
import type { Question } from '../types/question';
import {
  generateCustomExam,
  generateExam,
  generateRetryExam,
  getSubjectNameByCode,
  OFFICIAL_EXAM_SECONDS,
  PRACTICE_SECONDS_PER_QUESTION,
  type ExamQuestion,
  type SubjectQuota,
} from '../lib/examGenerator';

/** Ciclo de vida de un simulacro: pantalla previa → rindiendo → terminado. */
export type SimulationStatus = 'idle' | 'running' | 'finished';

export type SimulationMode = 'official' | 'practice' | 'retry';

export type StartSimulationConfig =
  | {
      mode?: 'official';
      durationSeconds?: number;
    }
  | {
      mode: 'practice';
      subject: string;
      count: number;
      difficulty?: string;
      durationSeconds?: number;
      title?: string;
    }
  | {
      mode: 'retry';
      failedQuestionIds: readonly string[];
      durationSeconds?: number;
      title?: string;
    };

/** Simulacro tal como vuelve desde IndexedDB. */
export type RestoredSimulation = {
  mode?: SimulationMode;
  examTitle?: string;
  durationSeconds?: number;
  status: 'running' | 'finished';
  questions: ExamQuestion[];
  answers: Record<string, string>;
  startTime: number;
  timeRemaining: number;
  distribution: SubjectQuota[];
  shortfall: number;
};

/** Resultado de un simulacro ya calificado por el backend. */
export type CompletedSimulationResult = {
  evaluation: AttemptResultData;
  questions: ExamQuestion[];
};

type SimulationState = {
  status: SimulationStatus;
  mode: SimulationMode;
  examTitle: string;
  durationSeconds: number;
  /** Preguntas ya filtradas: sin `correctKey` ni campos con la solución. */
  questions: ExamQuestion[];
  /** `questionId` → `optionKey` elegida. Solo hay una respuesta por pregunta. */
  answers: Record<string, string>;
  /** Momento (ms) en que arrancó. `null` mientras no haya simulacro activo. */
  startTime: number | null;
  /** Segundos restantes respecto a `durationSeconds`. */
  timeRemaining: number;
  /** Reparto real por materia del examen generado. */
  distribution: SubjectQuota[];
  /** Cuántas preguntas faltaron para completar la meta solicitada. */
  shortfall: number;
  /**
   * `false` hasta que se consultó IndexedDB. Evita pisar un simulacro guardado
   * con el estado inicial y evita mostrar `idle` mientras se restaura.
   */
  isHydrated: boolean;
  /** Último resultado calificado para mostrar en `/results` sin reescribir Dexie. */
  lastResult: CompletedSimulationResult | null;
  /** Genera el examen a partir del banco local. Devuelve `false` si no hay preguntas. */
  startSimulation: (
    bank: readonly (Question | ExamQuestion)[],
    config?: StartSimulationConfig,
  ) => boolean;
  answerQuestion: (questionId: string, optionKey: string) => void;
  finishSimulation: () => void;
  /** Recalcula el tiempo desde `startTime`; finaliza solo al llegar a cero. */
  tickTimer: () => void;
  /** Aplica un simulacro guardado (o marca la hidratación si no había ninguno). */
  restoreSimulation: (saved: RestoredSimulation | null) => void;
  setLastResult: (result: CompletedSimulationResult | null) => void;
  resetSimulation: () => void;
};

const initialState = {
  status: 'idle' as SimulationStatus,
  mode: 'official' as SimulationMode,
  examTitle: 'Simulacro Oficial',
  durationSeconds: OFFICIAL_EXAM_SECONDS,
  questions: [] as ExamQuestion[],
  answers: {} as Record<string, string>,
  startTime: null,
  timeRemaining: OFFICIAL_EXAM_SECONDS,
  distribution: [] as SubjectQuota[],
  shortfall: 0,
};

function buildSimulationSetup(
  bank: readonly (Question | ExamQuestion)[],
  config?: StartSimulationConfig,
) {
  if (config?.mode === 'retry') {
    const exam = generateRetryExam(bank, config.failedQuestionIds);
    return {
      exam,
      durationSeconds:
        config.durationSeconds ??
        exam.questions.length * PRACTICE_SECONDS_PER_QUESTION,
      mode: 'retry' as const,
      examTitle: config.title ?? 'Repaso de Errores',
    };
  }

  if (config?.mode === 'practice') {
    const exam = generateCustomExam(bank as readonly Question[], {
      subject: config.subject,
      count: config.count,
      difficulty: config.difficulty,
    });
    return {
      exam,
      durationSeconds:
        config.durationSeconds ?? config.count * PRACTICE_SECONDS_PER_QUESTION,
      mode: 'practice' as const,
      examTitle:
        config.title ?? `Práctica de ${getSubjectNameByCode(config.subject)}`,
    };
  }

  return {
    exam: generateExam(bank as readonly Question[]),
    durationSeconds: config?.durationSeconds ?? OFFICIAL_EXAM_SECONDS,
    mode: 'official' as const,
    examTitle: 'Simulacro Oficial',
  };
}

/**
 * Estado del simulacro activo.
 *
 * No lee ni escribe IndexedDB: recibe el banco en `startSimulation` y el
 * simulacro guardado en `restoreSimulation`. La persistencia vive en
 * `src/lib/simulationPersistence.ts`. Así el store se puede probar sin navegador.
 */
export const useSimulationStore = create<SimulationState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,
    isHydrated: false,
    lastResult: null,

    startSimulation: (bank, config) => {
      const { exam, durationSeconds, mode, examTitle } = buildSimulationSetup(
        bank,
        config,
      );

      // Sin preguntas no hay simulacro: se queda en 'idle' en vez de mostrar un examen vacío.
      if (exam.questions.length === 0) {
        set({ ...initialState, shortfall: exam.shortfall, isHydrated: true });
        return false;
      }

      set({
        status: 'running',
        mode,
        examTitle,
        durationSeconds,
        questions: exam.questions,
        answers: {},
        startTime: Date.now(),
        timeRemaining: durationSeconds,
        distribution: exam.distribution,
        shortfall: exam.shortfall,
        // Un examen recién arrancado ya es el estado válido: la hidratación
        // pendiente no debe pisarlo.
        isHydrated: true,
      });

      return true;
    },

    answerQuestion: (questionId, optionKey) => {
      // Contestar fuera del examen (o al terminar) no debe ensuciar el estado.
      if (get().status !== 'running') return;

      set((state) => ({ answers: { ...state.answers, [questionId]: optionKey } }));
    },

    finishSimulation: () => {
      if (get().status !== 'running') return;

      set({ status: 'finished' });
    },

    /**
     * El tiempo se recalcula desde `startTime`, no se resta de a uno: los
     * navegadores throttlean los intervalos en pestañas en segundo plano, y con
     * un contador acumulativo el alumno terminaría con minutos de regalo.
     */
    tickTimer: () => {
      const { status, startTime, durationSeconds } = get();

      if (status !== 'running' || startTime === null) return;

      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(durationSeconds - elapsed, 0);

      if (remaining === 0) {
        set({ timeRemaining: 0, status: 'finished' });
        return;
      }

      set({ timeRemaining: remaining });
    },

    restoreSimulation: (saved) => {
      // Nada guardado: solo queda marcada la hidratación.
      if (!saved || saved.questions.length === 0) {
        set({ ...initialState, isHydrated: true });
        return;
      }

      const mode: SimulationMode = saved.mode ?? 'official';
      const examTitle = saved.examTitle ?? 'Simulacro Oficial';
      const durationSeconds = saved.durationSeconds ?? OFFICIAL_EXAM_SECONDS;

      // Un simulacro 'running' sigue corriendo aunque la pestaña estuviera
      // cerrada: el tiempo se descuenta desde `startTime` real, no desde
      // el último `timeRemaining` persistido.
      const remaining =
        saved.status === 'running'
          ? Math.max(
              durationSeconds - Math.floor((Date.now() - saved.startTime) / 1000),
              0,
            )
          : saved.timeRemaining;

      set({
        status: remaining === 0 ? 'finished' : saved.status,
        mode,
        examTitle,
        durationSeconds,
        questions: saved.questions,
        answers: saved.answers,
        startTime: saved.startTime,
        timeRemaining: remaining,
        distribution: saved.distribution,
        shortfall: saved.shortfall,
        isHydrated: true,
      });
    },

    setLastResult: (result) => set({ lastResult: result }),

    // `isHydrated` vuelve a `true`: el reinicio es un estado válido, no el pre-hidratado.
    resetSimulation: () => set({ ...initialState, isHydrated: true }),
  })),
);
