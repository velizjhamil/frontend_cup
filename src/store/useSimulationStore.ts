import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Question } from '../types/question';
import {
  generateExam,
  OFFICIAL_EXAM_SECONDS,
  type ExamQuestion,
  type SubjectQuota,
} from '../lib/examGenerator';

/** Ciclo de vida de un simulacro: pantalla previa → rindiendo → terminado. */
export type SimulationStatus = 'idle' | 'running' | 'finished';

/** Simulacro tal como vuelve desde IndexedDB. */
export type RestoredSimulation = {
  status: 'running' | 'finished';
  questions: ExamQuestion[];
  answers: Record<string, string>;
  startTime: number;
  timeRemaining: number;
  distribution: SubjectQuota[];
  shortfall: number;
};

type SimulationState = {
  status: SimulationStatus;
  /** Las 40 preguntas ya filtradas: sin `correctKey` ni campos con la solución. */
  questions: ExamQuestion[];
  /** `questionId` → `optionKey` elegida. Solo hay una respuesta por pregunta. */
  answers: Record<string, string>;
  /** Momento (ms) en que arrancó. `null` mientras no haya simulacro activo. */
  startTime: number | null;
  /** Segundos restantes de los 40 minutos oficiales. */
  timeRemaining: number;
  /** Reparto real por materia del examen generado. */
  distribution: SubjectQuota[];
  /** Cuántas preguntas faltaron para llegar a 40 (`0` = examen completo). */
  shortfall: number;
  /**
   * `false` hasta que se consultó IndexedDB. Evita pisar un simulacro guardado
   * con el estado inicial y evita mostrar `idle` mientras se restaura.
   */
  isHydrated: boolean;
  /** Genera el examen a partir del banco local. Devuelve `false` si no hay preguntas. */
  startSimulation: (bank: readonly Question[]) => boolean;
  answerQuestion: (questionId: string, optionKey: string) => void;
  finishSimulation: () => void;
  /** Recalcula el tiempo desde `startTime`; finaliza solo al llegar a cero. */
  tickTimer: () => void;
  /** Aplica un simulacro guardado (o marca la hidratación si no había ninguno). */
  restoreSimulation: (saved: RestoredSimulation | null) => void;
  resetSimulation: () => void;
};

const initialState = {
  status: 'idle' as SimulationStatus,
  questions: [] as ExamQuestion[],
  answers: {} as Record<string, string>,
  startTime: null,
  timeRemaining: OFFICIAL_EXAM_SECONDS,
  distribution: [] as SubjectQuota[],
  shortfall: 0,
};

/**
 * Estado del simulacro activo (Fase 4).
 *
 * No lee ni escribe IndexedDB: recibe el banco en `startSimulation` y el
 * simulacro guardado en `restoreSimulation`. La persistencia vive en
 * `src/lib/simulationPersistence.ts`. Así el store se puede probar sin navegador.
 */
export const useSimulationStore = create<SimulationState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,
    isHydrated: false,

    startSimulation: (bank) => {
      const exam = generateExam(bank);

      // Sin preguntas no hay simulacro: se queda en 'idle' en vez de mostrar un examen vacío.
      if (exam.questions.length === 0) {
        set({ ...initialState, shortfall: exam.shortfall, isHydrated: true });
        return false;
      }

      set({
        status: 'running',
        questions: exam.questions,
        answers: {},
        startTime: Date.now(),
        timeRemaining: OFFICIAL_EXAM_SECONDS,
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
      const { status, startTime } = get();

      if (status !== 'running' || startTime === null) return;

      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(OFFICIAL_EXAM_SECONDS - elapsed, 0);

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

      // Un simulacro 'running' sigue corriendo aunque la pestaña estuviera
      // cerrada: el tiempo se descuenta desde `startTime` real, no desde
      // el último `timeRemaining` persistido.
      const remaining =
        saved.status === 'running'
          ? Math.max(
              OFFICIAL_EXAM_SECONDS - Math.floor((Date.now() - saved.startTime) / 1000),
              0,
            )
          : saved.timeRemaining;

      set({
        status: remaining === 0 ? 'finished' : saved.status,
        questions: saved.questions,
        answers: saved.answers,
        startTime: saved.startTime,
        timeRemaining: remaining,
        distribution: saved.distribution,
        shortfall: saved.shortfall,
        isHydrated: true,
      });
    },

    // `isHydrated` vuelve a `true`: el reinicio es un estado válido, no el pre-hidratado.
    resetSimulation: () => set({ ...initialState, isHydrated: true }),
  })),
);
