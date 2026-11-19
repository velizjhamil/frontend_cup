import { Outlet } from 'react-router-dom';
import { NetworkStatus } from '../NetworkStatus';

/** Pantallas públicas (Landing, Login): sin sidebar, solo el aviso offline flotante. */
export function PublicLayout() {
  return (
    <>
      <NetworkStatus />
      <Outlet />
    </>
  );
}
