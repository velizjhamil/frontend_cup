import { createAuthClient } from 'better-auth/react';

/**
 * Cliente de Better Auth para React.
 *
 * En desarrollo las rutas `/api/*` pasan por el proxy de Vite hacia `:4000`
 * (ver vite.config.ts), así que el baseURL relativo evita CORS y las cookies
 * viajan al mismo origen. En producción se define `VITE_API_URL` con el
 * dominio de la API.
 */
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL || window.location.origin,
});

export const { signIn, signUp, signOut, useSession } = authClient;

export type SessionData = typeof authClient.$Infer.Session;
export type SessionUser = SessionData['user'];

/**
 * Extrae `user` de forma segura desde `useSession().data`.
 * Si el proxy falla y devuelve un string HTML (SPA fallback) o un objeto
 * parcial durante la hidratación, devuelve `null` en vez de dejar pasar
 * un valor truthy sin `.user`.
 */
export function getSessionUser(session: unknown): SessionUser | null {
  if (typeof session !== 'object' || session === null) return null;
  const candidate = (session as { user?: unknown }).user;
  if (typeof candidate !== 'object' || candidate === null) return null;
  const user = candidate as Partial<SessionUser>;
  if (typeof user.id !== 'string' || typeof user.email !== 'string') return null;
  return candidate as SessionUser;
}
