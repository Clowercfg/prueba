import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages sirve el sitio bajo /prueba/ (nombre del repo).
export default defineConfig({
  base: '/prueba/',
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
