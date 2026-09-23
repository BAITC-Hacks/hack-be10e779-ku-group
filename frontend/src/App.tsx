import { useEffect, useState } from 'react'
import { api, type Health } from './api/client'

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Health>('/health').then(setHealth).catch((e: Error) => setError(e.message))
  }, [])

  return (
    <main className="page">
      <header className="topbar">
        <h1>KU group</h1>
        {health && (
          <span className={`badge badge-${health.mode}`}>
            {health.mode === 'live' ? 'живой режим' : 'демо-режим: сохранённые ответы модели'}
          </span>
        )}
      </header>
      {error && <p className="error">Backend недоступен: {error}</p>}
      {!health && !error && <p className="muted">Загрузка…</p>}
    </main>
  )
}
