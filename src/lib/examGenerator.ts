import type { Question } from '../types/question';

/**
 * Estándar del simulacro oficial del CUP de Ingeniería (ver docs/PRODUCT.md):
 * 4 materias × 10 preguntas = 40, con 40 minutos.
 */
export const OFFICIAL_EXAM_SIZE = 40;
export const OFFICIAL_EXAM_MINUTES = 40;
export const OFFICIAL_EXAM_SECONDS = OFFICIAL_EXAM_MINUTES * 60;

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

/**
 * Proyecta una fila del banco al subconjunto visible en el examen.
 * Se construye el objeto campo por campo a propósito: si mañana el banco
 * trae una columna nueva con la respuesta, no se filtra por accidente.
 */
function toExamQuestion(question: Question): ExamQuestion {
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
 * Genera un examen balanceado por materia a partir del banco local.
 *
 * - Función pura: mismo banco + mismo `random` ⇒ mismo examen.
 * - Reparte una cuota base entre las materias presentes y los lugares que
 *   sobran se completan con el resto del banco (así un banco desparejo no
 *   produce un examen corto si hay preguntas suficientes).
 * - No toca el orden de las opciones: se muestran como vienen de la base.
 * - Si el banco no alcanza, devuelve lo que hay y lo informa en `shortfall`;
 *   no rellena con duplicados ni inventa preguntas.
 */
export function generateExam(bank: readonly Question[], options: GeneratorOptions = {}): GeneratedExam {
    const size = options.size ?? OFFICIAL_EXAM_SIZE;
    const random = options.random ?? Math.random;

    if (size <= 0 || bank.length === 0) {
        return { questions: [], distribution: [], shortfall: Math.max(size, 0) };
    }

    const groups = groupBySubject(bank);
    const subjectOrder = shuffle([...groups.entries()], random);
    const baseQuota = Math.floor(size / subjectOrder.length);
    const remainder = size % subjectOrder.length;

    const selected: Question[] = [];
    const usedIds = new Set<string>();

    const take = (question: Question) => {
        selected.push(question);
        usedIds.add(question.id);
    };

    // 1. Cuota balanceada por materia.
    subjectOrder.forEach(([, questions], index) => {
        const quota = baseQuota + (index < remainder ? 1 : 0);
        const available = shuffle(questions, random);

        for (let i = 0; i < Math.min(quota, available.length); i += 1) {
            take(available[i]);
        }
    });

    // 2. Relleno: materias con menos preguntas que su cuota no deben acortar el examen.
    if (selected.length < size) {
        const leftovers = shuffle(bank.filter((question) => !usedIds.has(question.id)), random);

        for (const question of leftovers) {
            if (selected.length >= size) {
                break;
            }
            take(question);
        }
    }

    // 3. Mezcla final: las materias no deben salir agrupadas.
    const questions = shuffle(selected, random).map(toExamQuestion);

    const counts = new Map<string, number>();
    for (const question of questions) {
        counts.set(question.subjectId, (counts.get(question.subjectId) ?? 0) + 1);
    }

    const distribution = [...counts.entries()]
        .map(([subjectId, count]) => ({ subjectId, count }))
        .sort((a, b) => a.subjectId.localeCompare(b.subjectId));

    return {
        questions,
        distribution,
        shortfall: Math.max(size - questions.length, 0),
    };
}
