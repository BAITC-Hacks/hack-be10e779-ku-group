// Вход в шапке: POST /api/auth/login, токен в localStorage, роль рядом с именем.
// Форма открывается сама, если API ответил 401/403 (событие 'auth-required' из api/client.ts).

import { useEffect, useState, type FormEvent } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import { api, setToken, getToken } from '../api/client'
import { useT, type TKey } from '../i18n'
import './LoginBox.css'

type User = { username: string; role: string }
const ROLE_KEY: Record<string, TKey> = {
  dispatcher: 'app.login.dispatcher',
  analyst: 'app.login.analyst',
  admin: 'app.login.admin',
}
const TEST_USERS: [string, string, TKey][] = [
  ['dispatcher', 'dispatcher123', 'app.login.canDispatcher'],
  ['analyst', 'analyst123', 'app.login.canAnalyst'],
  ['admin', 'admin123', 'app.login.canAdmin'],
]

export function LoginBox() {
  const { t } = useT()
  const [user, setUser] = useState<User | null>(null)
  const [open, setOpen] = useState(false)
  // храним код ответа, а не текст: подпись переводится при смене языка
  const [reason, setReason] = useState<401 | 403 | null>(null)
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
      setReason(status === 403 ? 403 : 401)
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
        <button className="btn btn-ghost btn-sm" onClick={logout} title={t('app.login.logout')}>
          <span className="hide-sm">
            {user.username} · {ROLE_KEY[user.role] ? t(ROLE_KEY[user.role]) : user.role}
          </span>
          <LogOut size={16} />
        </button>
      ) : (
        <button className="btn btn-sm" onClick={() => setOpen((o) => !o)}>
          <LogIn size={16} /> <span className="hide-sm">{t('app.login.login')}</span>
        </button>
      )}
      {open && !user && (
        <form className="loginbox-panel" onSubmit={submit}>
          {reason && (
            <div className="loginbox-reason">{t(reason === 403 ? 'app.login.noRights' : 'app.login.needLogin')}</div>
          )}
          <label>
            {t('app.login.username')}
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>
          <label>
            {t('app.login.password')}
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
              {t('app.login.login')}
            </button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpen(false)}>
              {t('app.login.cancel')}
            </button>
          </div>
          <div className="loginbox-hint">
            {t('app.login.testUsers')}
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
                <span className="muted">{t(what)}</span>
              </button>
            ))}
          </div>
        </form>
      )}
    </div>
  )
}
