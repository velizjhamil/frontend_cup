import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AiTutorChat } from '../components/AiTutorChat';

const SUBJECTS = [
  { code: 'ingles', name: 'Inglés' },
  { code: 'computacion', name: 'Computación' },
  { code: 'matematicas', name: 'Matemáticas' },
  { code: 'fisica', name: 'Física' },
] as const;

type Subject = (typeof SUBJECTS)[number];

/**
 * Chat general por materia: el alumno elige una de las 4 materias del CUP y
 * consulta dudas conceptuales sin estar viendo una pregunta puntual. Reutiliza
 * `AiTutorChat` en modo `subject`, que envía `questionId: undefined` al backend.
 */
export default function Tutor() {
  const [selected, setSelected] = useState<Subject | null>(null);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center p-4 py-8">
      <div className="max-w-lg w-full space-y-5">
        <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-bold text-slate-900">Tutor IA por materia</h1>
            <Link to="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
              Volver
            </Link>
          </div>
          <p className="text-sm text-slate-600">
            Elegí una materia y hacele consultas conceptuales al tutor IA, sin necesidad de estar
            viendo una pregunta puntual.
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            {SUBJECTS.map((subject) => (
              <button
                key={subject.code}
                type="button"
                onClick={() => setSelected(subject)}
                className={`rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                  selected?.code === subject.code
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {subject.name}
              </button>
            ))}
          </div>
        </div>

        {selected && (
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <AiTutorChat key={selected.code} mode="subject" subjectName={selected.name} />
          </div>
        )}
      </div>
    </div>
  );
}
