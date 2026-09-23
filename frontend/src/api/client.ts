// Тонкий клиент к backend. Ошибки API приходят как {"detail": "..."} — пробрасываем текст пользователю.

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body instanceof FormData ? init?.headers : { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.detail ?? `Ошибка ${res.status}`)
  }
  return res.json() as Promise<T>
}

export type Health = { status: string; mode: 'live' | 'demo'; commit: string }
