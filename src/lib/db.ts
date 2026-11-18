import Dexie, { type EntityTable } from 'dexie';
import type { SubmitAttemptBody } from '../types/attempt';
import type { Question } from '../types/question';
import type { ExamQuestion, SubjectQuota } from './examGenerator';

/**
 * Simulacro guardado para sobrevivir a una recarga de la página.
 * Solo existe una fila (`id: 'active'`): no hay historial acá, eso es del backend.
 */
export type PersistedSimulation = {
  id: 'active';
  mode?: 'official' | 'practice' | 'retry';
  examTitle?: string;
  durationSeconds?: number;
  status: 'running' | 'finished';
  questions: ExamQuestion[];
  answers: Record<string, string>;
  startTime: number;
  timeRemaining: number;
  distribution: SubjectQuota[];
  shortfall: number;
  /** Cuándo se escribió la fila (diagnóstico, no se usa para el reloj). */
  savedAt: number;
};

/**
 * Intento terminado sin conexión: se guarda el payload tal cual se le manda
 * a `POST /api/attempts/submit` y se reintenta cuando vuelve internet.
 */
export type PendingAttempt = {
  id: string;
  payload: SubmitAttemptBody;
  createdAt: number;
};

/**
 * Base local (IndexedDB) para el modo offline y el modo invitado.
 * Solo se guardan las preguntas que expone la API pública: sin `correctKey`.
 */
export const db = new Dexie('cup-simulacro') as Dexie & {
  questions: EntityTable<Question, 'id'>;
  simulations: EntityTable<PersistedSimulation, 'id'>;
  pendingAttempts: EntityTable<PendingAttempt, 'id'>;
};

// Los campos listados son los índices; el resto viaja dentro del documento.
db.version(1).stores({
  questions: 'id, facultyId, subjectId, topic, status',
});

// v2: el simulacro en curso sobrevive a recargas y cierres de pestaña.
db.version(2).stores({
  simulations: 'id',
});

// v3: intentos terminados sin conexión, pendientes de enviar al backend.
db.version(3).stores({
  pendingAttempts: 'id',
});
