import { db } from '../lib/db';
import type {
  AttemptHistoryItem,
  AttemptHistoryResponse,
  AttemptResultData,
  RecommendationsData,
  SubmitAttemptBody,
  WeakPointsData,
} from '../types/attempt';
import type { ChatRequestBody } from '../types/chat';
import type { ApiError, Question, QuestionListResponse, QuestionQuery } from '../types/question';

/**
 * Por defecto todas las llamadas van al MISMO origen (`/api/...`):
 * - en desarrollo, el proxy de Vite las manda a `:4000`;
 * - en producción (Vercel), el rewrite de `vercel.json` las manda a Render.
 * Así la cookie de sesión es first-party y no la bloquea el navegador.
 * Definí `VITE_API_URL` solo si la API se sirve en otro dominio sin proxy
 * (eso obliga a cookies cross-site y CORS con credenciales).
 */
const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

async function requestApiPayload<T>(
  url: URL,
  init: RequestInit | undefined,
  fallbackError: string,
): Promise<T> {
  const response = await fetch(url, init);
  const payload: unknown = await response.json();

  if (!response.ok) {
    const apiError = payload as Partial<ApiError>;
    throw new Error(apiError.error?.message ?? `Error ${response.status} ${fallbackError}`);
  }

  return payload as T;
}

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
  const { data } = await requestApiPayload<Partial<QuestionListResponse>>(
    buildQuestionsUrl(query),
    undefined,
    'al pedir las preguntas.',
  );

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

/**
 * Envía el simulacro finalizado al backend para calcular el puntaje oficial
 * en el servidor y obtener la revisión por pregunta.
 */
export async function submitAttempt(body: SubmitAttemptBody): Promise<AttemptResultData> {
  const { data } = await requestApiPayload<{ data?: AttemptResultData }>(
    new URL('/api/attempts/submit', API_URL),
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    'al calificar el simulacro.',
  );

  if (!data) {
    throw new Error('Respuesta inesperada del backend: falta el objeto "data".');
  }

  return data;
}

/**
 * Obtiene el historial de simulacros del usuario autenticado (ordenados
 * del más reciente al más antiguo).
 */
export async function getAttemptsHistory(): Promise<AttemptHistoryItem[]> {
  const { data } = await requestApiPayload<Partial<AttemptHistoryResponse>>(
    new URL('/api/attempts', API_URL),
    {
      method: 'GET',
      credentials: 'include',
    },
    'al obtener el historial.',
  );

  if (!Array.isArray(data)) {
    throw new Error('Respuesta inesperada del backend: falta el arreglo "data".');
  }

  return data;
}

/**
 * Obtiene el detalle completo y la revisión por pregunta de un intento pasado.
 */
export async function getAttemptById(id: string): Promise<AttemptResultData> {
  const { data } = await requestApiPayload<{ data?: AttemptResultData }>(
    new URL(`/api/attempts/${encodeURIComponent(id)}`, API_URL),
    {
      method: 'GET',
      credentials: 'include',
    },
    'al obtener el detalle del intento.',
  );

  if (!data) {
    throw new Error('Respuesta inesperada del backend: falta el objeto "data".');
  }

  return data;
}

/**
 * Obtiene los puntos débiles por tema y por pregunta del usuario autenticado.
 */
export async function getWeakPoints(): Promise<WeakPointsData> {
  const { data } = await requestApiPayload<{ data?: WeakPointsData }>(
    new URL('/api/stats/weak-points', API_URL),
    {
      method: 'GET',
      credentials: 'include',
    },
    'al calcular tus puntos débiles.',
  );

  if (!data) {
    throw new Error('Respuesta inesperada del backend: falta el objeto "data".');
  }

  return data;
}

/**
 * Pide a la IA hasta 3 consejos de estudio en Markdown a partir de los
 * puntos débiles del usuario autenticado. `hasEnoughData: false` indica que
 * todavía no hay suficiente historial para una recomendación personalizada.
 */
export async function getStudyRecommendations(): Promise<RecommendationsData> {
  const { data } = await requestApiPayload<{ data?: RecommendationsData }>(
    new URL('/api/stats/recommendations', API_URL),
    {
      method: 'POST',
      credentials: 'include',
    },
    'al generar tu plan de estudio.',
  );

  if (!data) {
    throw new Error('Respuesta inesperada del backend: falta el objeto "data".');
  }

  return data;
}

type SseEventPayload = {
  chunk?: string;
  done?: boolean;
  cached?: boolean;
  error?: string;
};

function parseSseDataFrame(rawFrame: string): SseEventPayload | null {
  const dataLines = rawFrame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());

  if (dataLines.length === 0) return null;

  try {
    return JSON.parse(dataLines.join('\n')) as SseEventPayload;
  } catch {
    return null;
  }
}

/**
 * Envía el historial al tutor IA (`/api/chat`) y consume el stream Server-Sent Events
 * entregando cada fragmento incremental a `onChunk`.
 */
export async function streamTutorChat(
  body: ChatRequestBody,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<{ cached: boolean }> {
  const response = await fetch(new URL('/api/chat', API_URL), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let message = `Error ${response.status} al consultar al tutor IA.`;
    try {
      const payload = (await response.json()) as Partial<ApiError>;
      if (payload.error?.message) {
        message = payload.error.message;
      }
    } catch {
      // Mantiene mensaje por defecto si la respuesta de error no es JSON.
    }
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error('El navegador no soporta lectura en streaming para esta respuesta.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let cached = false;

  const consumeFrame = (frame: string) => {
    const payload = parseSseDataFrame(frame);
    if (!payload) return;

    if (payload.error) {
      throw new Error(payload.error);
    }
    if (typeof payload.chunk === 'string' && payload.chunk.length > 0) {
      onChunk(payload.chunk);
    }
    if (payload.done === true && typeof payload.cached === 'boolean') {
      cached = payload.cached;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n');
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      consumeFrame(frame);
    }
  }

  buffer += decoder.decode().replaceAll('\r\n', '\n');
  if (buffer.trim().length > 0) {
    consumeFrame(buffer);
  }

  return { cached };
}
