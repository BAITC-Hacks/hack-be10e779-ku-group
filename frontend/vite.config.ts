import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// dev: запросы /api и /health проксируются на backend — по умолчанию :8000; другой адрес — API_TARGET в окружении
// или в frontend/.env.development.local (файл не коммитится). В проде статику отдаёт сам FastAPI.
export default defineConfig(({ mode }) => {
  const target = process.env.API_TARGET ?? loadEnv(mode, process.cwd(), '').API_TARGET ?? 'http://localhost:8000'
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': target,
        '/health': target,
      },
    },
  }
})
