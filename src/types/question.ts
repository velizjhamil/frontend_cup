import type { paths } from '../api/schema';

type QuestionsGet = paths['/api/questions']['get'];

/** Respuesta 200 del backend: `{ data: Question[] }`. */
export type QuestionListResponse = QuestionsGet['responses'][200]['content']['application/json'];

/**
 * Pregunta tal como la entrega `GET /api/questions`.
 * Derivada de `openapi.json` — no se escribe a mano (REPOS.md).
 * No incluye `correctKey` (D-010).
 */
export type Question = QuestionListResponse['data'][number];

export type QuestionOption = Question['options'][number];

export type QuestionStatus = Question['status'];

/** Query string que acepta el endpoint, tal como la documenta el contrato. */
export type QuestionQuery = NonNullable<QuestionsGet['parameters']['query']>;

/** Error uniforme del backend: `{ error: { code, message } }`. */
export type ApiError = QuestionsGet['responses'][404]['content']['application/json'];
