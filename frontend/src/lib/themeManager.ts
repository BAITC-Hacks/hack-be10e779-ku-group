// Тема: светлая / тёмная / системная (по умолчанию). Выбор хранится в localStorage; в режиме «системная» следим за
// prefers-color-scheme. Первичную тему до загрузки JS ставит инлайн-скрипт в index.html (без «мигания») —
// логика там та же, держать синхронно.

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_KEY = 'theme-mode'
const LEGACY_KEY = 'theme' // прежняя версия хранила только light/dark

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null)

export function readMode(): ThemeMode {
  try {
    const m = localStorage.getItem(THEME_KEY)
    if (m === 'light' || m === 'dark' || m === 'system') return m
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy === 'light' || legacy === 'dark') return legacy
  } catch {
    /* хранилище недоступно */
  }
  return 'system'
}

export function saveMode(m: ThemeMode) {
  try {
    localStorage.setItem(THEME_KEY, m)
  } catch {
    /* не критично */
  }
}

/** Системная тема; если браузер её не сообщает — тёмная (фоллбек продукта). */
export function resolve(m: ThemeMode): ResolvedTheme {
  if (m !== 'system') return m
  const mq = media()
  if (!mq) return 'dark'
  return mq.matches ? 'dark' : 'light'
}

/** Применить до перерисовки: графики читают цвета из CSS-переменных во время рендера. */
export function apply(t: ResolvedTheme) {
  const root = document.documentElement
  root.dataset.theme = t
  root.style.colorScheme = t
}

/** Подписка на смену системной темы (нужна только в режиме «системная»). */
export function onSystemChange(cb: (t: ResolvedTheme) => void): () => void {
  const mq = media()
  if (!mq) return () => {}
  const h = (e: MediaQueryListEvent) => cb(e.matches ? 'dark' : 'light')
  mq.addEventListener('change', h)
  return () => mq.removeEventListener('change', h)
}
