import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'Simulacro CUP',
        short_name: 'CUP Simulacro',
        description: 'Simulacro de examen CUP para la FICCT - UAGRM',
        theme_color: '#2563eb',
        background_color: '#f1f5f9',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // Las navegaciones a /api (ej. callback de Google OAuth) deben llegar al
        // backend, no al index.html cacheado de la SPA.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    // Las rutas /api/* viajan al backend por el proxy: mismo origen, sin CORS
    // y con las cookies de sesión incluidas (docs/SECURITY.md).
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
