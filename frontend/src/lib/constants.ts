import type { Meta } from '../api/types'

// Значения из CASE.md — используются, пока бэкенд не отдаёт /api/meta.
export const DEFAULT_META: Meta = {
  station: { name: 'ВЭС, Алматинская обл.', tz: 'Asia/Almaty', utc_offset: '+05:00' },
  turbines: [
    { id: 't1', lat: 43.64515, lon: 78.535604 },
    { id: 't2', lat: 43.643198, lon: 78.538828 },
  ],
  issue_range: { first: '2026-01-31', last: '2026-02-27' },
  history_range: { first: '2023-03-11T00:00', last: '2026-01-31T23:00' },
  mode: 'demo',
  llm_model: null,
  weather_sources: [],
  model_ready: true,
  saved_forecasts: [],
}

export const DEFAULT_ISSUE_DATE = '2026-02-09'
export const LOW_POWER = 0.05 // «почти нет выработки» — как в pipeline.LOW
