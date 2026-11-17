import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { getSessionUser, useSession } from '../lib/auth-client';
import { useGuestStore } from '../store/useGuestStore';

/**
 * Pantalla 1 de docs/PRODUCT.md: qué es el simulacro y las dos entradas
 * ("Entrar" con cuenta o "Probar como invitado").
 */
export default function Landing() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const user = getSessionUser(session);
  const enterAsGuest = useGuestStore((state) => state.enterAsGuest);

  const startAsGuest = () => {
    enterAsGuest();
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-blue-600 p-8 text-center">
          <h1 className="text-3xl font-bold text-white">Simulacro CUP</h1>
          <p className="text-blue-100 mt-2">FICCT · UAGRM</p>
        </div>

        <div className="p-6 space-y-3">
          <p className="text-slate-600 text-sm text-center mb-4">
            Practicá Inglés, Computación, Matemáticas y Física con preguntas del
            examen de admisión, y seguí tu progreso.
          </p>

          {user ? (
            <Button type="button" onClick={() => navigate('/dashboard')}>
              Ir a mi dashboard
            </Button>
          ) : (
            <Button type="button" onClick={() => navigate('/login')}>
              Entrar
            </Button>
          )}

          <button
            type="button"
            onClick={startAsGuest}
            className="w-full bg-white border border-slate-300 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-colors hover:bg-slate-50"
          >
            Probar como invitado
          </button>

          <p className="text-xs text-slate-500 text-center pt-2">
            Como invitado tus intentos se guardan solo en este dispositivo.{' '}
            <Link to="/login" className="text-blue-600 hover:underline">
              Crear una cuenta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
