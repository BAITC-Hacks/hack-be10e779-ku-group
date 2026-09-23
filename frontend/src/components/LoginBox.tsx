// Вход в шапке: POST /api/auth/login, токен в localStorage, роль рядом с именем.
// Форма открывается сама, если API ответил 401/403 (событие 'auth-required' из api/client.ts).

import { useEffect, useState, type FormEvent } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import { api, setToken, getToken } from '../api/client'
import './LoginBox.css'

type User = { username: string; role: string }
const ROLE_RU: Record<string, string> = { dispatcher: 'диспетчер', analyst: 'аналитик', admin: 'администратор' }
const TEST_USERS = [
  ['dispatcher', 'dispatcher123', 'прогноз'],
  ['analyst', 'analyst123', '+ бэктест, автономный прогон'],
  ['admin', 'admin123', '+ станции и турбины'],
]

export function LoginBox() {
  const [user, setUser] = useState<User | null>(null)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const [username, setUsername] = useState('dispatcher')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (getToken()) {
      api<User>('/api/auth/me')
        .then(setUser)
        .catch(() => setToken(null))
    }
    const onAuth = (e: Event) => {
      const status = (e as CustomEvent<number>).detail
      setReason(status === 403 ? 'Недостаточно прав для этого действия — войдите под ролью выше.' : 'Для этого действия нужен вход.')
      if (status === 401) {
        setToken(null)
        setUser(null)
      }
      setOpen(true)
    }
    window.addEventListener('auth-required', onAuth)
    return () => window.removeEventListener('auth-required', onAuth)
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      setToken(res.token)
      setUser(res.user)
      setOpen(false)
      setReason(null)
      setPassword('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const logout = () => {
    setToken(null)
    setUser(null)
  }

  return (
    <div className="loginbox">
      {user ? (
        <button className="btn btn-ghost btn-sm" onClick={logout} title="Выйти">
          <span className="hide-sm">
            {user.username} · {ROLE_RU[user.role] ?? user.role}
          </span>
          <LogOut size={16} />
        </button>
      ) : (
        <button className="btn btn-sm" onClick={() => setOpen((o) => !o)}>
          <LogIn size={16} /> <span className="hide-sm">Войти</span>
        </button>
      )}
      {open && !user && (
        <form className="loginbox-panel" onSubmit={submit}>
          {reason && <div className="loginbox-reason">{reason}</div>}
          <label>
            Логин
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </label>
          {error && <div className="loginbox-error">{error}</div>}
          <div className="loginbox-actions">
            <button className="btn btn-sm" type="submit" disabled={busy}>
              Войти
            </button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpen(false)}>
              Отмена
            </button>
          </div>
          <div className="loginbox-hint">
            Тестовые учётки для проверки:
            {TEST_USERS.map(([u, p, what]) => (
              <button
                key={u}
                type="button"
                className="loginbox-user"
                onClick={() => {
                  setUsername(u)
                  setPassword(p)
                }}
              >
                <span className="mono">
                  {u} / {p}
                </span>{' '}
                <span className="muted">{what}</span>
              </button>
            ))}
          </div>
        </form>
      )}
    </div>
  )
}
