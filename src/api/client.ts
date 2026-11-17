import { db } from '../lib/db';
import type { ApiError, Question, QuestionListResponse, QuestionQuery } from '../types/question';

/**
 * En desarrollo las llamadas pasan por el proxy de Vite (`/api` → `:4000`),
 * por eso el default es el mismo origen. En producción se define VITE_API_URL.
 */
const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

function buildQuestionsUrl(query: QuestionQuery): URL {
  const url = new URL('/api/questions', API_URL);

  if (query.faculty) url.searchParams.set('faculty', query.faculty);
  if (query.subject) url.searchParams.set('subject', query.subject);
  if (query.count !== undefined) url.searchParams.set('count', String(query.count));
  if (query.exclude) url.searchParams.set('exclude', query.exclude);

  return url;
}

/**
 * Trae preguntas del backend respetando el contrato `{ data }` / `{ error }`.
 * Lanza un Error con el mensaje del backend si la respuesta no es 2xx.
 */
export async function fetchQuestions(query: QuestionQuery = {}): Promise<Question[]> {
  const response = await fetch(buildQuestionsUrl(query));
  const payload: unknown = await response.json();

  if (!response.ok) {
    const apiError = payload as Partial<ApiError>;
    throw new Error(apiError.error?.message ?? `Error ${response.status} al pedir las preguntas.`);
  }

  const { data } = payload as QuestionListResponse;

  if (!Array.isArray(data)) {
    throw new Error('Respuesta inesperada del backend: falta el arreglo "data".');
  }

  return data;
}

/**
 * Descarga el banco y lo guarda en IndexedDB.
 * Reemplaza el contenido local: es una sincronización completa, no incremental.
 */
export async function syncQuestions(query: QuestionQuery = {}): Promise<number> {
  const questions = await fetchQuestions(query);

  await db.transaction('rw', db.questions, async () => {
    await db.questions.clear();
    await db.questions.bulkPut(questions);
  });

  return questions.length;
}

/** Cantidad de preguntas guardadas localmente (para la UI offline). */
export function countLocalQuestions(): Promise<number> {
  return db.questions.count();
}
