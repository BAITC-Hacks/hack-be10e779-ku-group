// Типы по docs/api-contract.md (v2). Поля, которых бэкенд пока не отдаёт (v1 → v2), помечены «?» —
// интерфейс обязан работать и без них.

export type Mode = 'live' | 'demo'

export type Health = {
  status: string
  mode?: Mode
  commit?: string
  llm_model?: string | null
  model?: string // "warming" — модель обучается/прогревается, "ready" — готова
}

export type HourPoint = {
  time: string // "2026-02-10T13:00", местное время станции UTC+5
  lead_day: 1 | 2
  p50: number // доля номинала 0–1
  p10: number
  p90: number
  t1?: number | null
  t2?: number | null
  curve?: number | null // базовый метод «кривая мощности»
  wind_100m: number | null // прогнозный ветер 100 м, м/с
  actual?: number | null // факт (для февраля всегда null)
}

export type AgentStep = {
  type: 'model' | 'tool'
  name?: string | null // имя инструмента; v1 и v2 называют их по-разному — см. lib/steps.ts
  arguments?: string | null // обычно JSON, но не всегда
  output?: string | null // обычно JSON, может быть обрезан или быть текстом
  ok?: boolean | null
  content?: string | null // текст хода LLM или служебная запись
  tool_calls?: string[]
  source?: string
  ms: number
}

export type TimeIntegrity = {
  issued_at: string // момент прогноза (конец дня D)
  latest_weather_run?: string // самый свежий использованный выпуск погоды (агент после исправления утечки)
  latest_run_published_by?: string // когда он опубликован (выпуск + задержка публикации ~7 ч)
  latest_weather_run_used?: string // старое имя поля (контракт v2 до 23.09 15:00)
  ok: boolean
  rule: string
}

export type Summary = {
  energy_d1: number // часы работы на полную мощность
  energy_d2: number
  peak_hour: string
  low_hours: number
  interval_width?: number | null
}

export type UpdateInfo = {
  previous_issue: string
  day: string
  mean_abs_change: number
  max_abs_change: number
  energy_old: number
  energy_new: number
  significant: boolean
}

export type Forecast = {
  issue_date: string // "2026-02-09" — прогноз сделан в конце этого дня
  issued_at: string // "2026-02-09T23:59"
  weather_source: string
  weather_runs: string
  time_integrity?: TimeIntegrity
  excluded_sources?: string[]
  hours: HourPoint[] // 48 часов: D+1 и D+2
  summary: Summary
  analysis: {
    flags: string[]
    changed_vs_previous?: number | null
    update?: UpdateInfo
  }
  explanation: string
  mode: Mode
  fallback?: boolean
  steps: AgentStep[]
  computed_at?: string
}

export type Meta = {
  station: { name: string; tz: string; utc_offset: string }
  turbines: { id: 't1' | 't2'; lat: number; lon: number }[]
  issue_range: { first: string; last: string }
  history_range: { first: string; last: string }
  mode: Mode
  llm_model: string | null
  weather_sources: string[]
  model_ready: boolean
  saved_forecasts: string[]
}

export type BacktestDay = {
  issue_date: string
  energy_d1: number
  energy_d2?: number
  low_hours?: number
  flags: string[]
}

export type Backtest = {
  runs: number
  file: string | null
  final_file?: string
  generated_at?: string
  forecasts: BacktestDay[]
  final_hours?: { time: string; p50: number; p10: number; p90: number; issue_date: string }[]
}

export type MetricRow = {
  lead?: string | null // "D+1" | "D+2"
  model: string
  hours?: number | null
  mae?: number | null
  rmse?: number | null
  nmae?: number | null
  coverage?: number | null // в v1 покрытие приходит отдельной строкой rows с этим полем
}

export type Metrics = {
  holdout: string
  rows: MetricRow[]
  coverage?: Record<string, number>
  calibration?: {
    method: string
    target: number
    coverage_before: number
    coverage_after: number
    width_before: number
    width_after: number
  }
}

export type HistoryPoint = { time: string; actual: number | null; wind_measured: number | null }

export type HoldoutPoint = {
  time: string
  lead_day: 1 | 2
  p50: number
  p10: number
  p90: number
  curve: number
  actual: number | null
}
