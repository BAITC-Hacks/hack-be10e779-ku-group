// Тонкий клиент к backend. Ошибки API приходят как {"detail": "..."} — пробрасываем текст пользователю.

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Токен входа (POST /api/auth/login). Действия (прогноз, прогоны, станции) требуют роль; чтение открыто.
const TOKEN_KEY = 'anemo_token'
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* хранилище недоступно — вход до перезагрузки страницы не сохранится */
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await fetch(path, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? { ...auth, ...init?.headers }
        : { 'Content-Type': 'application/json', ...auth, ...init?.headers },
  })
  if (res.status === 401 || res.status === 403) {
    // шапка покажет форму входа (LoginBox)
    window.dispatchEvent(new CustomEvent('auth-required', { detail: res.status }))
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.detail ?? `Ошибка ${res.status}`)
  }
  return res.json() as Promise<T>
}

