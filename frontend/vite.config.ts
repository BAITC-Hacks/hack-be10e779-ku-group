import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// dev: запросы /api и /health проксируются на backend :8000; в проде статику отдаёт сам FastAPI
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    },
  },
})
