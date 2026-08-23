import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages sirve el sitio bajo /prueba/ (nombre del repo).
export default defineConfig({
  base: '/prueba/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
})
