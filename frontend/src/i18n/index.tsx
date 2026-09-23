// Точка входа локализации: провайдер, хук useT() и функция tr() для кода вне компонентов.
//   const { t, locale } = useT();  t('forecast.kpi.tomorrow')  t('february.kpi.warnDays', { count: 5 })
// В useMemo/useCallback, где собираются строки, добавляйте locale в зависимости.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { detectLocale, LOCALE_KEY, setCurrentLocale, translateIn, getLocale, type Locale, type Params, type Paths } from './core'
import ru from './locales/ru'
import kk from './locales/kk'
import en from './locales/en'

export { LOCALES, type Locale } from './core'

const DICTS: Record<Locale, unknown> = { ru, kk, en }

export type TKey = Paths<typeof ru>
export type TFn = (key: TKey, params?: Params) => string

/** Перевод вне React (форматирование, опции графиков) — на текущем языке. */
export const tr: TFn = (key, params) => translateIn(DICTS, getLocale(), key, params)

type Ctx = { locale: Locale; setLocale: (l: Locale) => void; t: TFn }
const I18nContext = createContext<Ctx | null>(null)

export function I18nProvider(props: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const l = detectLocale()
    setCurrentLocale(l) // до первого рендера детей: tr() и форматирование уже на нужном языке
    return l
  })

  const setLocale = useCallback((l: Locale) => {
    setCurrentLocale(l) // синхронно, до перерисовки — как с темой
    setLocaleState(l)
    try {
      localStorage.setItem(LOCALE_KEY, l)
    } catch {
      /* не критично */
    }
  }, [])

  const value = useMemo<Ctx>(
    () => ({ locale, setLocale, t: (key, params) => translateIn(DICTS, locale, key, params) }),
    [locale, setLocale],
  )
  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>
}

export function useT(): Ctx {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useT() вне <I18nProvider>')
  return ctx
}
