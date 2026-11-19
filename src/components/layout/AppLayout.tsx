import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, NavLink, Outlet, useBlocker, useNavigate } from 'react-router-dom';
import {
  Bot,
  ClipboardList,
  GraduationCap,
  History,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import { getSessionUser, signOut, useSession } from '../../lib/auth-client';
import { useGuestStore } from '../../store/useGuestStore';
import { useSimulationStore } from '../../store/useSimulationStore';
import { NetworkStatus } from '../NetworkStatus';

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

const NAV_ITEMS: readonly NavItem[] = [
  {
    to: '/dashboard',
    label: 'Inicio',
    icon: LayoutDashboard,
  },
  {
    to: '/simulation',
    label: 'Simulacro',
    icon: ClipboardList,
  },
  {
    to: '/history',
    label: 'Historial',
    icon: History,
  },
  {
    to: '/tutor',
    label: 'Tutor IA',
    icon: Bot,
  },
];

const DESKTOP_QUERY = '(min-width: 768px)';
const COLLAPSED_STORAGE_KEY = 'cup-sidebar-collapsed';

function subscribeDesktop(onChange: () => void): () => void {
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function getIsDesktop(): boolean {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, value ? '1' : '0');
  } catch {
    // Preferencia visual: si el storage falla, solo no se recuerda.
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return initials || '?';
}

/**
 * Layout de las pantallas autenticadas (o en modo invitado): header fijo,
 * sidebar colapsable en desktop y drawer deslizable en móvil.
 *
 * Mientras hay un simulacro en curso, salir de `/simulation` pide
 * confirmación. El progreso no se pierde (vive en el store y en IndexedDB),
 * pero el cronómetro sigue corriendo porque se calcula desde `startTime`.
 */
export function AppLayout() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const user = getSessionUser(session);
  const isGuest = useGuestStore((state) => state.isGuest);
  const leaveGuest = useGuestStore((state) => state.leaveGuest);
  const isSimulationRunning = useSimulationStore((state) => state.status === 'running');

  const isDesktop = useSyncExternalStore(subscribeDesktop, getIsDesktop);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(readCollapsed);
  const signOutAfterLeaveRef = useRef(false);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isSimulationRunning &&
      currentLocation.pathname === '/simulation' &&
      nextLocation.pathname !== '/simulation',
  );

  const closeMobile = useCallback(() => setIsMobileOpen(false), []);

  // El drawer solo existe en móvil: en desktop se ignora el flag para que el
  // overlay no quede activo de fondo al agrandar la ventana.
  const isDrawerOpen = !isDesktop && isMobileOpen;

  useEffect(() => {
    if (!isDrawerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen]);

  const handleToggleMenu = () => {
    if (isDesktop) {
      setIsCollapsed((current) => {
        writeCollapsed(!current);
        return !current;
      });
      return;
    }
    setIsMobileOpen((current) => !current);
  };

  const clearSession = async () => {
    if (user !== null) {
      try {
        await signOut();
      } catch (err) {
        console.error('[auth] Error al cerrar sesión:', err);
      }
    }
    leaveGuest();
  };

  const handleSignOut = async () => {
    closeMobile();
    // Con un simulacro en curso, la navegación pasa primero por el diálogo
    // de confirmación; la sesión se cierra recién si el alumno acepta salir.
    if (isSimulationRunning) {
      signOutAfterLeaveRef.current = true;
      navigate('/');
      return;
    }
    await clearSession();
    navigate('/');
  };

  const handleSignIn = () => {
    closeMobile();
    navigate('/login');
  };

  const handleConfirmLeave = () => {
    const shouldSignOut = signOutAfterLeaveRef.current;
    signOutAfterLeaveRef.current = false;
    blocker.proceed?.();
    if (shouldSignOut) void clearSession();
  };

  const handleCancelLeave = () => {
    signOutAfterLeaveRef.current = false;
    blocker.reset?.();
  };

  const displayName = user?.name || user?.email || 'Invitado';
  const isMenuExpanded = isDesktop ? !isCollapsed : isDrawerOpen;
  const collapsedDesktop = isDesktop && isCollapsed;

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <NetworkStatus variant="inline" />

      <header className="z-40 flex h-16 shrink-0 items-center gap-2 border-b border-primary-hover bg-primary px-3 text-primary-foreground shadow-md sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={handleToggleMenu}
          aria-label={isMenuExpanded ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={isMenuExpanded}
          aria-controls="app-sidebar"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-200 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-secondary"
        >
          {isDrawerOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>

        <Link
          to="/dashboard"
          onClick={closeMobile}
          className="flex min-w-0 items-center gap-2 rounded-xl pr-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-secondary"
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <GraduationCap className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="truncate text-base font-bold tracking-tight sm:text-lg">
            Simulacro CUP <span className="hidden text-secondary sm:inline">· FICCT</span>
          </span>
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {user ? (
            <div className="flex items-center gap-2" title={user.email}>
              <span
                aria-hidden="true"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-bold text-primary"
              >
                {getInitials(displayName)}
              </span>
              <span className="hidden max-w-40 truncate text-sm font-medium md:block">
                {displayName}
              </span>
            </div>
          ) : (
            <span className="rounded-full border border-secondary/70 bg-primary-hover px-3 py-1 text-xs font-semibold uppercase tracking-wide text-secondary">
              {isGuest ? 'Invitado' : 'Sin sesión'}
            </span>
          )}

          {user ? (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              aria-label="Cerrar sesión"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-secondary/70 px-2.5 text-sm font-semibold transition-colors duration-200 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-secondary sm:px-3"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSignIn}
              aria-label="Iniciar sesión"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-secondary px-2.5 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-secondary/60 sm:px-3"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Ingresar</span>
            </button>
          )}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div
          aria-hidden="true"
          onClick={closeMobile}
          className={`absolute inset-0 z-30 bg-slate-900/50 backdrop-blur-[1px] transition-opacity duration-300 md:hidden ${
            isDrawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        />

        <aside
          id="app-sidebar"
          aria-label="Menú principal"
          inert={!isDesktop && !isDrawerOpen}
          className={`absolute inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r border-secondary/60 bg-card shadow-xl transition-[transform,width] duration-300 ease-in-out md:static md:max-w-none md:translate-x-0 md:shadow-none ${
            isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
          } ${isCollapsed ? 'md:w-20' : 'md:w-64'}`}
        >
          <nav className="flex-1 overflow-y-auto overflow-x-hidden p-3">
            <p
              className={`px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground ${
                collapsedDesktop ? 'sr-only' : ''
              }`}
            >
              Menú
            </p>
            <ul className="space-y-1">
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
                const isRunningItem = to === '/simulation' && isSimulationRunning;
                return (
                  <li key={to}>
                    <NavLink
                      to={to}
                      onClick={closeMobile}
                      title={collapsedDesktop ? label : undefined}
                      className={({ isActive }) =>
                        `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-secondary/60 ${
                          collapsedDesktop ? 'md:justify-center md:px-0' : ''
                        } ${
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-foreground hover:bg-muted hover:text-primary'
                        }`
                      }
                    >
                      <>
                          <span className="relative shrink-0">
                            <Icon className="h-5 w-5" aria-hidden="true" />
                            {isRunningItem && (
                              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400 ring-2 ring-card" />
                            )}
                          </span>
                          <span
                            className={`min-w-0 truncate text-sm font-semibold ${collapsedDesktop ? 'sr-only' : ''}`}
                          >
                            {label}
                            {isRunningItem && <span className="sr-only"> (en curso)</span>}
                          </span>
                        </>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="border-t border-secondary/60 p-3">
            <button
              type="button"
              onClick={user ? () => void handleSignOut() : handleSignIn}
              title={collapsedDesktop ? (user ? 'Cerrar sesión' : 'Iniciar sesión') : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-secondary/60 ${
                collapsedDesktop ? 'md:justify-center md:px-0' : ''
              } ${
                user
                  ? 'text-red-700 hover:bg-red-50'
                  : 'border border-secondary bg-muted text-primary hover:bg-secondary/50'
              }`}
            >
              {user ? (
                <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
              ) : (
                <LogIn className="h-5 w-5 shrink-0" aria-hidden="true" />
              )}
              <span className={collapsedDesktop ? 'sr-only' : ''}>
                {user ? 'Cerrar sesión' : 'Iniciar sesión'}
              </span>
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {blocker.state === 'blocked' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="leave-simulation-title"
            aria-describedby="leave-simulation-description"
            className="w-full max-w-md rounded-2xl border border-secondary/60 bg-card p-6 shadow-2xl"
          >
            <h2 id="leave-simulation-title" className="text-lg font-bold text-primary">
              ¿Salir del simulacro?
            </h2>
            <p id="leave-simulation-description" className="mt-2 text-sm text-muted-foreground">
              Tus respuestas quedan guardadas y se puede retomar el examen desde «Simulacro» en el menú. El cronómetro sigue corriendo mientras estés fuera.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleConfirmLeave}
                className="rounded-xl border border-secondary px-4 py-2.5 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-secondary/60"
              >
                Salir igual
              </button>
              <button
                type="button"
                autoFocus
                onClick={handleCancelLeave}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-secondary"
              >
                Seguir en el simulacro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
