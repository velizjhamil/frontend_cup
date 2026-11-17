import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireSession } from './components/RequireSession';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Simulation from './pages/Simulation';

/**
 * Rutas de la app. Las protegidas viven dentro de <RequireSession />:
 * sin sesión ni modo invitado redirigen a /login.
 * Historial y resultados se agregan en las fases siguientes.
 */
export const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/login', element: <Login /> },
  {
    element: <RequireSession />,
    children: [
      { path: '/dashboard', element: <Dashboard /> },
      { path: '/simulation', element: <Simulation /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
