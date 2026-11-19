import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AttemptReviewView } from '../components/AttemptReviewView';
import { Button } from '../components/Button';
import { useSimulationStore, type CompletedSimulationResult } from '../store/useSimulationStore';

function isCompletedResult(value: unknown): value is CompletedSimulationResult {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<CompletedSimulationResult>;
  return (
    typeof candidate.evaluation === 'object' &&
    candidate.evaluation !== null &&
    Array.isArray(candidate.evaluation.results) &&
    Array.isArray(candidate.questions)
  );
}

/**
 * Pantalla 6/7 de docs/PRODUCT.md: resultados oficiales del simulacro y
 * revisión pregunta por pregunta con solución, explicación y KaTeX.
 */
export default function Results() {
  const location = useLocation();
  const navigate = useNavigate();
  const storedResult = useSimulationStore((state) => state.lastResult);

  const routeResult = isCompletedResult(location.state) ? location.state : null;
  const activeResult = routeResult ?? storedResult;

  if (!activeResult) {
    return (
      <div className="min-h-full bg-background flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-6 text-center space-y-4">
          <h1 className="text-xl font-bold text-slate-900">Todavía no hay resultados</h1>
          <p className="text-sm text-slate-600">
            Finalizá un simulacro para ver tu puntaje oficial y la revisión detallada.
          </p>
          <Button type="button" onClick={() => navigate('/simulation')}>
            Ir a simulacro
          </Button>
          <p className="text-xs text-slate-500">
            <Link to="/dashboard" className="hover:underline">
              Volver al dashboard
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <AttemptReviewView
      evaluation={activeResult.evaluation}
      questions={activeResult.questions}
    />
  );
}
