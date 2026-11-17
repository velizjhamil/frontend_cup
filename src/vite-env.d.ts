/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL de la API. Vacía en desarrollo: se usa el proxy de Vite a :4000. */
  readonly VITE_API_URL?: string;
  /** 'true' cuando el backend tiene GOOGLE_CLIENT_ID/SECRET configurados. */
  readonly VITE_GOOGLE_AUTH_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
