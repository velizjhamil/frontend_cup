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
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <section className="bg-primary text-primary-foreground px-6 py-10 md:w-1/2 md:flex md:flex-col md:justify-center md:px-12 lg:px-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-secondary">
          FICCT · UAGRM
        </p>
        <h1 className="mt-2 text-4xl md:text-5xl font-bold leading-tight">Simulacro CUP</h1>
        <p className="mt-4 text-primary-foreground/80 md:text-lg max-w-md">
          Practicá Inglés, Computación, Matemáticas y Física con preguntas del examen de
          admisión, y seguí tu progreso.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {['Inglés', 'Computación', 'Matemáticas', 'Física'].map((subject) => (
            <span
              key={subject}
              className="px-3 py-1 rounded-full text-xs font-semibold bg-secondary text-secondary-foreground"
            >
              {subject}
            </span>
          ))}
        </div>
      </section>

      <main className="flex-1 flex items-center justify-center p-4 py-8 md:p-8">
        <div className="w-full max-w-md bg-card rounded-2xl shadow-xl border border-secondary/60 p-6 md:p-8 space-y-3">
          <h2 className="text-2xl font-bold text-primary">Empezá a practicar</h2>
          <p className="text-sm text-muted-foreground pb-2">
            Entrá con tu cuenta o probá sin registrarte.
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

          <Button type="button" variant="outline" onClick={startAsGuest}>
            Probar como invitado
          </Button>

          <p className="text-xs text-muted-foreground text-center pt-2">
            Como invitado tus intentos se guardan solo en este dispositivo.{' '}
            <Link to="/login" className="text-primary font-semibold hover:underline">
              Crear una cuenta
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
