import { shallow } from 'zustand/shallow';
import { db, type PersistedSimulation } from './db';
import { useSimulationStore, type RestoredSimulation } from '../store/useSimulationStore';
import type { ExamQuestion, SubjectQuota } from './examGenerator';

/** Única fila de la tabla `simulations`: no hay historial local, eso es del backend. */
const ACTIVE_ID: PersistedSimulation['id'] = 'active';

/** Lo que observamos del store para decidir si hay que escribir en IndexedDB. */
type PersistedSlice = {
  isHydrated: boolean;
  status: PersistedSimulation['status'] | 'idle';
  questions: ExamQuestion[];
  answers: Record<string, string>;
  startTime: number | null;
  distribution: SubjectQuota[];
  shortfall: number;
  /**
   * Mientras corre vale `null` a propósito: el tiempo se deriva de `startTime`,
   * así que un tick por segundo no debe escribir en disco (serían 2400 escrituras).
   */
  timeRemaining: number | null;
};

let writeQueue: Promise<void> = Promise.resolve();

/** Serializa las escrituras para que una respuesta vieja no pise a la nueva. */
function enqueue(task: () => Promise<void>): void {
  writeQueue = writeQueue.then(task).catch((error: unknown) => {
    console.error('[simulación] No se pudo guardar en IndexedDB:', error);
  });
}

/** Lee el simulacro guardado. Devuelve `null` si no hay o si IndexedDB falla. */
export async function loadPersistedSimulation(): Promise<RestoredSimulation | null> {
  try {
    const saved = await db.simulations.get(ACTIVE_ID);

    if (!saved || saved.questions.length === 0) return null;

    return {
      status: saved.status,
      questions: saved.questions,
      answers: saved.answers,
      startTime: saved.startTime,
      timeRemaining: saved.timeRemaining,
      distribution: saved.distribution,
      shortfall: saved.shortfall,
    };
  } catch (error) {
    console.error('[simulación] No se pudo leer el simulacro guardado:', error);
    return null;
  }
}

/**
 * Restaura el simulacro en curso al arrancar la app.
 * Si no hay nada guardado, solo marca la hidratación (el store queda en `idle`).
 */
export async function hydrateSimulation(): Promise<void> {
  if (useSimulationStore.getState().isHydrated) return;

  const saved = await loadPersistedSimulation();

  // Otra acción pudo hidratar/arrancar mientras se leía IndexedDB.
  if (useSimulationStore.getState().isHydrated) return;

  useSimulationStore.getState().restoreSimulation(saved);
}

async function persistSlice(slice: PersistedSlice): Promise<void> {
  // Antes de hidratar, el estado en memoria es el inicial: escribirlo borraría el examen guardado.
  if (!slice.isHydrated) return;

  if (slice.status === 'idle' || slice.startTime === null) {
    await db.simulations.delete(ACTIVE_ID);
    return;
  }

  await db.simulations.put({
    id: ACTIVE_ID,
    status: slice.status,
    questions: slice.questions,
    answers: slice.answers,
    startTime: slice.startTime,
    timeRemaining: useSimulationStore.getState().timeRemaining,
    distribution: slice.distribution,
    shortfall: slice.shortfall,
    savedAt: Date.now(),
  });
}

/**
 * Sincroniza el simulacro con IndexedDB automáticamente.
 *
 * Se llama DESPUÉS de `hydrateSimulation()`: si se suscribe primero, el estado
 * inicial podría pisar el examen guardado.
 * Devuelve la función para cortar la suscripción.
 */
export function startSimulationPersistence(): () => void {
  return useSimulationStore.subscribe(
    (state): PersistedSlice => ({
      isHydrated: state.isHydrated,
      status: state.status,
      questions: state.questions,
      answers: state.answers,
      startTime: state.startTime,
      distribution: state.distribution,
      shortfall: state.shortfall,
      timeRemaining: state.status === 'finished' ? state.timeRemaining : null,
    }),
    (slice) => {
      enqueue(() => persistSlice(slice));
    },
    // `shallow` evita escribir en cada tick del reloj (el slice no cambia).
    { equalityFn: shallow },
  );
}
