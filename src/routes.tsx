import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireSession } from './components/RequireSession';
import AttemptDetail from './pages/AttemptDetail';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Results from './pages/Results';
import Simulation from './pages/Simulation';
import Tutor from './pages/Tutor';

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
      { path: '/results', element: <Results /> },
      { path: '/history', element: <History /> },
      { path: '/history/:id', element: <AttemptDetail /> },
      { path: '/tutor', element: <Tutor /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
