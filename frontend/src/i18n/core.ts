// Ядро локализации: без сторонних библиотек. Источник ключей — русские словари (src/i18n/locales/ru/*), казахский и
// английский обязаны иметь ту же форму (тип Dict<>), поэтому пропущенный или лишний ключ — ошибка компиляции.
// Склонения — Intl.PluralRules (ru: one/few/many/other, kk и en: one/other).

export type Locale = 'kk' | 'ru' | 'en'

export const LOCALES: { id: Locale; short: string; name: string }[] = [
  { id: 'kk', short: 'ҚАЗ', name: 'Қазақша' },
  { id: 'ru', short: 'РУС', name: 'Русский' },
  { id: 'en', short: 'ENG', name: 'English' },
]

export const DEFAULT_LOCALE: Locale = 'ru'
export const LOCALE_KEY = 'lang'

/** Формы множественного числа: {count} подставляется автоматически. */
export type PluralForms = { one: string; few?: string; many?: string; other: string }

/** Форма словаря перевода, повторяющая русский словарь T: строки → строки, склонения → склонения. */
export type Dict<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends { other: string } ? PluralForms : Dict<T[K]>
}

/** Все пути к листьям словаря: 'forecast.kpi.tomorrow'. */
export type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends { other: string }
      ? `${P}${K}`
      : Paths<T[K], `${P}${K}.`>
}[keyof T & string]

export type Params = Record<string, string | number>

export function isLocale(v: unknown): v is Locale {
  return v === 'kk' || v === 'ru' || v === 'en'
}

/** Язык: сохранённый выбор → язык браузера (kk/ru/en) → русский. */
export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY)
    if (isLocale(saved)) return saved
  } catch {
    /* хранилище недоступно */
  }
  const langs = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []
  for (const l of langs) {
    const base = l.toLowerCase().split('-')[0]
    if (base === 'kk' || base === 'kz') return 'kk'
    if (base === 'ru') return 'ru'
    if (base === 'en') return 'en'
  }
  return DEFAULT_LOCALE
}

// текущий язык на уровне модуля — для кода вне React (форматирование, опции графиков)
let current: Locale = DEFAULT_LOCALE
export const getLocale = (): Locale => current
export function setCurrentLocale(l: Locale) {
  current = l
  document.documentElement.lang = l
}

const pluralRules = new Map<Locale, Intl.PluralRules>()
function pluralCategory(l: Locale, n: number): string {
  let r = pluralRules.get(l)
  if (!r) {
    r = new Intl.PluralRules(l === 'kk' ? 'kk-KZ' : l)
    pluralRules.set(l, r)
  }
  return r.select(n)
}

function lookup(dict: unknown, key: string): unknown {
  let node: unknown = dict
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

function interpolate(s: string, params?: Params): string {
  if (!params) return s
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m))
}

/** Перевод по ключу с фоллбеком на русский, затем на сам ключ (видно в интерфейсе — легко заметить пропуск). */
export function translateIn(dicts: Record<Locale, unknown>, locale: Locale, key: string, params?: Params): string {
  let v = lookup(dicts[locale], key)
  if (v === undefined) v = lookup(dicts.ru, key)
  if (typeof v === 'string') return interpolate(v, params)
  if (v && typeof v === 'object' && 'other' in v) {
    const forms = v as PluralForms
    const n = Number(params?.count ?? 0)
    const cat = pluralCategory(locale, n) as keyof PluralForms
    return interpolate(forms[cat] ?? forms.other, { ...params, count: params?.count ?? n })
  }
  return key
}
