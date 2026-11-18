import type { Question } from '../types/question';

/**
 * Estándar del simulacro oficial del CUP de Ingeniería:
 * 4 materias × 10 preguntas = 40, en 60 minutos (1 hora), ordenadas por bloques de materia.
 */
export const OFFICIAL_EXAM_SIZE = 40;
export const OFFICIAL_EXAM_MINUTES = 60;
export const OFFICIAL_EXAM_SECONDS = OFFICIAL_EXAM_MINUTES * 60;
export const PRACTICE_SECONDS_PER_QUESTION = 90;

export type SubjectCode = 'matematicas' | 'fisica' | 'computacion' | 'ingles';
export type PracticeCount = 5 | 10 | 15;
export type ExamDifficulty = 'easy' | 'medium' | 'hard';

export type SubjectCatalogItem = {
    code: SubjectCode;
    name: string;
    prefix: string;
    order: number;
};

export const SUBJECT_CATALOG: readonly SubjectCatalogItem[] = [
    { code: 'matematicas', name: 'Matemáticas', prefix: 'mat-', order: 0 },
    { code: 'fisica', name: 'Física', prefix: 'fis-', order: 1 },
    { code: 'computacion', name: 'Computación', prefix: 'com-', order: 2 },
    { code: 'ingles', name: 'Inglés', prefix: 'ing-', order: 3 },
];

export function inferSubjectCode(question: { id: string }): SubjectCode | null {
    const normalizedId = question.id.trim().toLowerCase();
    const found = SUBJECT_CATALOG.find((item) => normalizedId.startsWith(item.prefix));
    return found?.code ?? null;
}

export function getSubjectLabel(question: { id: string }): string {
    const code = inferSubjectCode(question);
    const found = SUBJECT_CATALOG.find((item) => item.code === code);
    return found?.name ?? 'General';
}

export function getSubjectNameByCode(code: string): string {
    const normalized = code.trim().toLowerCase();
    const found = SUBJECT_CATALOG.find((item) => item.code === normalized);
    return found?.name ?? code;
}

export function matchesSubject(
    question: Pick<Question, 'id' | 'subjectId'>,
    subjectFilter: string,
): boolean {
    const target = subjectFilter.trim().toLowerCase();
    if (!target) return true;
    if (question.subjectId.toLowerCase() === target) return true;
    return inferSubjectCode(question) === target;
}

/**
 * Pregunta tal como puede verla el alumno mientras rinde.
 *
 * Es un subconjunto deliberado de `Question`: fuera `correctKey` (no existe en
 * el contrato público), y fuera también `explanationMd`, `procedureMd` y
 * `videoUrl` porque suelen contener la respuesta (ver problema conocido #5).
 * El compilador impide que la pantalla del examen muestre la solución.
 */
export type ExamQuestion = Pick<
    Question,
    'id' | 'facultyId' | 'subjectId' | 'topic' | 'statementMd' | 'imageUrl' | 'options' | 'difficulty'
>;

/** Cuántas preguntas aportó cada materia al examen. */
export type SubjectQuota = {
    subjectId: string;
    count: number;
};

export type GeneratedExam = {
    questions: ExamQuestion[];
    distribution: SubjectQuota[];
    /** Cuántas preguntas faltaron para completar el tamaño pedido (0 = examen completo). */
    shortfall: number;
};

export type GeneratorOptions = {
    /** Tamaño del examen. Por defecto, los 40 del simulacro oficial. */
    size?: number;
    /** Fuente de aleatoriedad inyectable: hace el generador determinista en tests. */
    random?: () => number;
};

export type CustomExamOptions = {
    /** Código de materia (`matematicas`, `fisica`, `computacion`, `ingles`) o `subjectId` UUID. */
    subject: string;
    /** Cantidad solicitada (ej: 5, 10, 15). */
    count: number;
    /** Dificultad opcional (`easy`, `medium`, `hard`). */
    difficulty?: string;
    /** Fuente de aleatoriedad inyectable. */
    random?: () => number;
};

/** Fisher-Yates: reparte en orden uniforme sin sesgar (sort(Math.random) sí sesga). */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
    const copy = [...items];

    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
}

function groupBySubject(bank: readonly Question[]): Map<string, Question[]> {
    const groups = new Map<string, Question[]>();

    for (const question of bank) {
        const group = groups.get(question.subjectId);

        if (group) {
            group.push(question);
        } else {
            groups.set(question.subjectId, [question]);
        }
    }

    return groups;
}

function getSubjectSortRank(groupQuestions: readonly Question[]): number {
    const first = groupQuestions[0];
    if (!first) return SUBJECT_CATALOG.length;
    const code = inferSubjectCode(first);
    const catalogItem = SUBJECT_CATALOG.find((item) => item.code === code);
    return catalogItem?.order ?? SUBJECT_CATALOG.length;
}

function computeDistribution(questions: readonly ExamQuestion[]): SubjectQuota[] {
    const counts = new Map<string, number>();
    for (const question of questions) {
        counts.set(question.subjectId, (counts.get(question.subjectId) ?? 0) + 1);
    }

    return [...counts.entries()]
        .map(([subjectId, count]) => ({ subjectId, count }))
        .sort((a, b) => a.subjectId.localeCompare(b.subjectId));
}

/**
 * Proyecta una fila del banco al subconjunto visible en el examen.
 * Se construye el objeto campo por campo a propósito: si mañana el banco
 * trae una columna nueva con la respuesta, no se filtra por accidente.
 */
function toExamQuestion(question: Question | ExamQuestion): ExamQuestion {
    return {
        id: question.id,
        facultyId: question.facultyId,
        subjectId: question.subjectId,
        topic: question.topic,
        statementMd: question.statementMd,
        imageUrl: question.imageUrl,
        options: question.options,
        difficulty: question.difficulty,
    };
}

/**
 * Genera el simulacro oficial balanceado por materia y agrupado por bloques.
 *
 * - Función pura: mismo banco + mismo `random` ⇒ mismo examen.
 * - Baraja con Fisher-Yates **solo dentro de cada materia** y luego concatena
 *   los bloques de cada materia en orden (no mezcla materias entre sí).
 * - No toca el orden de las opciones: se muestran como vienen de la base.
 * - Si el banco es desparejo, rellena sin duplicados manteniendo las preguntas
 *   dentro del bloque de su propia materia e informa el `shortfall`.
 */
export function generateExam(bank: readonly Question[], options: GeneratorOptions = {}): GeneratedExam {
    const size = options.size ?? OFFICIAL_EXAM_SIZE;
    const random = options.random ?? Math.random;

    if (size <= 0 || bank.length === 0) {
        return { questions: [], distribution: [], shortfall: Math.max(size, 0) };
    }

    const groups = groupBySubject(bank);
    const orderedGroups = [...groups.entries()].sort(([idA, listA], [idB, listB]) => {
        const rankDiff = getSubjectSortRank(listA) - getSubjectSortRank(listB);
        return rankDiff !== 0 ? rankDiff : idA.localeCompare(idB);
    });

    const baseQuota = Math.floor(size / orderedGroups.length);
    const remainder = size % orderedGroups.length;

    const subjectBuckets = new Map<string, Question[]>();
    const usedIds = new Set<string>();
    let selectedCount = 0;

    // 1. Cuota balanceada por materia, barajada únicamente dentro de cada bloque.
    orderedGroups.forEach(([subjectId, groupQuestions], index) => {
        const quota = baseQuota + (index < remainder ? 1 : 0);
        const available = shuffle(groupQuestions, random);
        const picked: Question[] = [];

        for (let i = 0; i < Math.min(quota, available.length); i += 1) {
            const question = available[i];
            picked.push(question);
            usedIds.add(question.id);
            selectedCount += 1;
        }

        subjectBuckets.set(subjectId, picked);
    });

    // 2. Relleno manteniendo la agrupación por materia si una materia tiene menos de su cuota.
    if (selectedCount < size) {
        const leftovers = shuffle(bank.filter((question) => !usedIds.has(question.id)), random);

        for (const question of leftovers) {
            if (selectedCount >= size) {
                break;
            }
            const bucket = subjectBuckets.get(question.subjectId) ?? [];
            bucket.push(question);
            subjectBuckets.set(question.subjectId, bucket);
            usedIds.add(question.id);
            selectedCount += 1;
        }
    }

    // 3. Concatenar bloques ordenados por materia (sin mezclar materias entre sí).
    const questions = orderedGroups
        .flatMap(([subjectId]) => subjectBuckets.get(subjectId) ?? [])
        .map(toExamQuestion);

    return {
        questions,
        distribution: computeDistribution(questions),
        shortfall: Math.max(size - questions.length, 0),
    };
}

/**
 * Filtra el banco por materia y dificultad opcional para el Modo Práctica
 * Personalizada, baraja las coincidencias y devuelve hasta `options.count`.
 */
export function filterPracticeBank(
    bank: readonly Question[],
    options: Pick<CustomExamOptions, 'subject' | 'difficulty'>,
): Question[] {
    const normalizedDifficulty = options.difficulty?.trim().toLowerCase() ?? '';
    const filterByDifficulty = normalizedDifficulty.length > 0 && normalizedDifficulty !== 'all';

    return bank.filter((question) => {
        if (!matchesSubject(question, options.subject)) {
            return false;
        }
        if (filterByDifficulty) {
            return (question.difficulty ?? '').trim().toLowerCase() === normalizedDifficulty;
        }
        return true;
    });
}

/**
 * Genera una práctica personalizada para una materia y cantidad específicas (5, 10, 15).
 */
export function generateCustomExam(
    bank: readonly Question[],
    options: CustomExamOptions,
): GeneratedExam {
    const targetCount = Math.max(options.count, 0);
    const random = options.random ?? Math.random;

    if (targetCount === 0 || bank.length === 0) {
        return { questions: [], distribution: [], shortfall: targetCount };
    }

    const filtered = filterPracticeBank(bank, options);
    const picked = shuffle(filtered, random).slice(0, targetCount).map(toExamQuestion);

    return {
        questions: picked,
        distribution: computeDistribution(picked),
        shortfall: Math.max(targetCount - picked.length, 0),
    };
}

export type RetryExamOptions = {
    random?: () => number;
};

/**
 * Genera un examen de repaso únicamente con las preguntas falladas o dejadas en blanco,
 * devolviéndolas barajadas sin duplicados.
 */
export function generateRetryExam(
    bank: readonly (Question | ExamQuestion)[],
    failedQuestionIds: readonly string[],
    options: RetryExamOptions = {},
): GeneratedExam {
    const targetIds = new Set(failedQuestionIds.filter((id) => id.trim().length > 0));
    const random = options.random ?? Math.random;

    if (targetIds.size === 0 || bank.length === 0) {
        return { questions: [], distribution: [], shortfall: targetIds.size };
    }

    const seenIds = new Set<string>();
    const matched: (Question | ExamQuestion)[] = [];

    for (const question of bank) {
        if (!targetIds.has(question.id) || seenIds.has(question.id)) {
            continue;
        }
        seenIds.add(question.id);
        matched.push(question);
    }

    const picked = shuffle(matched, random).map(toExamQuestion);

    return {
        questions: picked,
        distribution: computeDistribution(picked),
        shortfall: Math.max(targetIds.size - picked.length, 0),
    };
}
