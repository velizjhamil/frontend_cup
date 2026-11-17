import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { signIn, signUp } from '../lib/auth-client';
import { useGuestStore } from '../store/useGuestStore';

type Mode = 'login' | 'register';

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
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-blue-600 p-6 text-center">
          <h1 className="text-2xl font-bold text-white">
            {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </h1>
          <p className="text-blue-100 mt-1">Simulacro CUP · FICCT</p>
        </div>

        <form className="p-6 space-y-4" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Nombre</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoComplete="name"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
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
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
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
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
            />
            {mode === 'register' && (
              <span className="text-xs text-slate-500 mt-1 block">
                Mínimo 8 caracteres.
              </span>
            )}
          </label>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Enviando…'
              : mode === 'login'
                ? 'Entrar'
                : 'Crear cuenta'}
          </Button>

          {googleEnabled && (
            <button
              type="button"
              onClick={() => void handleGoogle()}
              className="w-full bg-white border border-slate-300 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-colors hover:bg-slate-50"
            >
              Continuar con Google
            </button>
          )}

          <p className="text-sm text-center text-slate-600">
            {mode === 'login' ? '¿No tenés cuenta?' : '¿Ya tenés cuenta?'}{' '}
            <button
              type="button"
              onClick={switchMode}
              className="text-blue-600 font-medium hover:underline"
            >
              {mode === 'login' ? 'Registrate' : 'Entrá'}
            </button>
          </p>

          <p className="text-xs text-center text-slate-500">
            <Link to="/" className="hover:underline">
              Volver al inicio
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
