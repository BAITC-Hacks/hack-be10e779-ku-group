import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// dev: запросы /api и /health проксируются на backend (по умолчанию :8000, иначе API_TARGET=http://localhost:8010);
// в проде статику отдаёт сам FastAPI
const target = process.env.API_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': target,
      '/health': target,
    },
  },
})
