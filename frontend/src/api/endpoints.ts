// Все вызовы API в одном месте (docs/api-contract.md). Эндпоинты v2, которых бэкенд ещё может не иметь, возвращают null
// на 404/405 — экраны показывают понятное состояние вместо ошибки.

import { api, ApiError } from './client'
import type { AgentStep, AutonomousRun, Backtest, Forecast, Health, HistoryPoint, HoldoutPoint, Meta, Metrics } from './types'
import { DEFAULT_META } from '../lib/constants'

async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return null
    throw e
  }
}

export const getHealth = () => api<Health>('/health')

/** v2; пока эндпоинта нет — берём значения по умолчанию и режим из /health. */
export async function getMeta(health: Health | null): Promise<Meta> {
  const meta = await orNull(api<Meta>('/api/meta'))
  if (meta) return meta
  return {
    ...DEFAULT_META,
    mode: health?.mode ?? 'demo',
    llm_model: health?.llm_model ?? null,
    model_ready: health?.model ? health.model !== 'warming' : true,
  }
}

/** LIVE, но цикл досчитал планировщик: поле fallback (v2) или служебная запись в журнале без source (agent.run). */
function withFallback(f: Forecast): Forecast {
  if (f.fallback != null || f.mode !== 'live') return f
  const byLog = f.steps.some((s) => s.type === 'model' && !s.source && /планировщик/i.test(s.content ?? ''))
  return { ...f, fallback: byLog }
}

export const postForecast = (issue_date: string) =>
  api<Forecast>('/api/forecast', { method: 'POST', body: JSON.stringify({ issue_date }) }).then(withFallback)

/** Сохранённый прогноз; null — на эту дату ещё не считали (или эндпоинта пока нет). */
/** Шаги агента, завершённые к этому моменту: опрашивать во время прогноза, чтобы этапы отмечались по ходу. */
export const getForecastProgress = (issue_date: string) =>
  api<{ issue_date: string; steps: AgentStep[] }>(`/api/forecast/progress/${encodeURIComponent(issue_date)}`)

export const getForecast = (issue_date: string) =>
  orNull(api<Forecast>(`/api/forecast/${encodeURIComponent(issue_date)}`)).then((f) => (f ? withFallback(f) : f))

/** Готовый ретроспективный прогон февраля; null — не выполнялся (или эндпоинта пока нет). */
export const getBacktest = () => orNull(api<Backtest>('/api/backtest'))

/** Полный прогон 31.01–27.02 (~30–60 с). Тело не передаём: контракт v2 всегда считает весь период. */
export const postBacktest = () => api<Backtest>('/api/backtest', { method: 'POST', body: JSON.stringify({}) })

export const backtestCsvUrl = (kind: 'all' | 'final') => `/api/backtest/csv?kind=${kind}`

export const getMetrics = () => orNull(api<Metrics>('/api/metrics'))

export const getHistory = (start: string, end: string) =>
  api<{ points: HistoryPoint[] }>(`/api/history?start=${start}&end=${end}`).then((r) => r.points)

/** P1: «ожидалось / реально» на январе. null — эндпоинта пока нет. */
export const getHoldout = (issue_date: string) =>
  orNull(
    api<{ issue_date: string; hours: HoldoutPoint[]; mae?: { model: number; curve: number } }>(
      `/api/holdout?issue_date=${issue_date}`,
    ),
  )

/** Автономный прогон агента по дням выпуска (фон). 409 — уже идёт. */
export const startAutonomousRun = () =>
  api<AutonomousRun>('/api/autonomous-run', { method: 'POST', body: JSON.stringify({}) })

/** Прогресс автономного прогона: опрашивать раз в 2 с, пока status === 'running'. */
export const getAutonomousRun = () => api<AutonomousRun>('/api/autonomous-run')
