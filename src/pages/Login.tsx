import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { signIn, signUp } from '../lib/auth-client';
import { useGuestStore } from '../store/useGuestStore';

type Mode = 'login' | 'register';

// Soft secondary focus ring plus a navy border: the ring alone (#AAC0E1 on white)
// is below the 3:1 non-text contrast, the primary border keeps focus visible.
const INPUT_CLASSES =
  'mt-1 w-full rounded-lg border border-secondary bg-card px-3 py-2.5 text-slate-900 outline-none transition-colors duration-200 focus:border-primary focus:ring-4 focus:ring-secondary/50';

function formatAuthError(
  err: { message?: string | null; status?: number; statusText?: string },
  fallback: string,
): string {
  if (err.message && err.message.trim().length > 0) {
    return err.message;
  }
  if (err.status !== undefined) {
    return `${fallback} (HTTP ${err.status}${err.statusText ? `: ${err.statusText}` : ''})`;
  }
  return fallback;
}

/**
 * Pantalla 2 de docs/PRODUCT.md: login y registro en una sola vista.
 * Email + contraseña con Better Auth; Google solo si el backend tiene credenciales.
 */
export default function Login() {
  const navigate = useNavigate();
  const leaveGuest = useGuestStore((state) => state.leaveGuest);

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const googleEnabled = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === 'true';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = mode === 'login'
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name });

      if (result.error) {
        console.error('[auth] Falló signIn/signUp:', result.error);
        setError(formatAuthError(result.error, 'No se pudo completar la operación.'));
        return;
      }

      leaveGuest();
      navigate('/dashboard');
    } catch (err) {
      console.error('[auth] Error de red en signIn/signUp:', err);
      setError('No se pudo contactar al servidor. Revisá tu conexión.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);

    try {
      const result = await signIn.social({ provider: 'google', callbackURL: '/dashboard' });

      if (result.error) {
        console.error('[auth] Falló Google signIn:', result.error);
        setError(formatAuthError(result.error, 'No se pudo iniciar sesión con Google.'));
      }
    } catch (err) {
      console.error('[auth] Error de red en Google signIn:', err);
      setError('No se pudo contactar al servidor. Revisá tu conexión.');
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="bg-primary text-primary-foreground px-6 py-8 md:w-1/2 md:flex md:flex-col md:justify-center md:px-12 lg:px-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-secondary">
          FICCT · UAGRM
        </p>
        <h1 className="mt-2 text-3xl md:text-4xl font-bold leading-tight">Simulacro CUP</h1>
        <p className="mt-3 text-primary-foreground/80 md:text-lg max-w-md">
          Prepará tu examen de admisión con preguntas reales y seguí tu progreso.
        </p>
        <ul className="mt-8 hidden md:block space-y-3 text-primary-foreground/90">
          <li className="flex items-center gap-3">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-secondary" />
            Simulacros cronometrados como el examen oficial
          </li>
          <li className="flex items-center gap-3">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-secondary" />
            Tus puntos débiles por materia y tema
          </li>
          <li className="flex items-center gap-3">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-secondary" />
            Tutor IA para repasar cada pregunta
          </li>
        </ul>
      </aside>

      <main className="flex-1 flex items-center justify-center p-4 py-8 md:p-8">
        <div className="w-full max-w-md bg-card rounded-2xl shadow-xl border border-secondary/60 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-primary">
            {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === 'login'
              ? 'Ingresá con tu cuenta para guardar tu progreso.'
              : 'Creá tu cuenta en menos de un minuto.'}
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {mode === 'register' && (
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Nombre</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  autoComplete="name"
                  className={INPUT_CLASSES}
                />
              </label>
            )}

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                className={INPUT_CLASSES}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className={INPUT_CLASSES}
              />
              {mode === 'register' && (
                <span className="text-xs text-muted-foreground mt-1 block">
                  Mínimo 8 caracteres.
                </span>
              )}
            </label>

            {error && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                {error}
              </p>
            )}

            <Button type="submit" disabled={isSubmitting} className="text-base">
              {isSubmitting
                ? 'Enviando…'
                : mode === 'login'
                  ? 'Entrar'
                  : 'Crear cuenta'}
            </Button>

            {googleEnabled && (
              <Button type="button" variant="outline" onClick={() => void handleGoogle()}>
                Continuar con Google
              </Button>
            )}

            <p className="text-sm text-center text-slate-600">
              {mode === 'login' ? '¿No tenés cuenta?' : '¿Ya tenés cuenta?'}{' '}
              <button
                type="button"
                onClick={switchMode}
                className="text-primary font-semibold hover:underline"
              >
                {mode === 'login' ? 'Registrate' : 'Entrá'}
              </button>
            </p>

            <p className="text-xs text-center text-muted-foreground">
              <Link to="/" className="hover:text-primary hover:underline transition-colors duration-200">
                Volver al inicio
              </Link>
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
