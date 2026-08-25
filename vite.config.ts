import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Node env sin depender de @types/node (este archivo corre en Node en build).
declare const process: { env: Record<string, string | undefined> }

// Base del sitio: GitHub Pages sirve bajo /prueba/ (nombre del repo);
// Cloudflare (Workers Builds, SPA + API en un solo origen) sirve en '/'.
// El build de Cloudflare define VITE_BASE_PATH=/ como variable de build.
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/prueba/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Túneles de prueba para móvil (trycloudflare/localhost.run) sin bloqueo por Host.
    allowedHosts: ['.trycloudflare.com', '.lhr.life'],
    // API local (worker dev) en desarrollo; en producción VITE_API_BASE apunta al worker.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})
