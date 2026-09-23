// Инструменты агента → подпись и этап степпера. Бэкенд v1 (pipeline) и агент v2 называют шаги по-разному —
// поддерживаем оба набора имён; неизвестное имя показываем как есть.
// Значения STAGES — внутренние идентификаторы этапов; подпись на текущем языке — stageLabel().

import { tr, type TKey } from '../i18n'

export const STAGES = ['Погода', 'Подготовка', 'Модель', 'Прогноз', 'Анализ', 'Пересчёт'] as const
export type Stage = (typeof STAGES)[number]

const STAGE_KEYS: Record<Stage, TKey> = {
  Погода: 'steps.stages.weather',
  Подготовка: 'steps.stages.prep',
  Модель: 'steps.stages.model',
  Прогноз: 'steps.stages.forecast',
  Анализ: 'steps.stages.analysis',
  Пересчёт: 'steps.stages.update',
}

/** Подпись этапа на текущем языке интерфейса. */
export function stageLabel(stage: Stage): string {
  return tr(STAGE_KEYS[stage])
}

// подпись инструмента — ключ steps.tools.<имя> (переводится при каждом вызове, чтобы следовать за языком)
const TOOLS: Record<string, { label: TKey; stage: Stage }> = {
  // v2 — backend/app/forecast/agent.py
  rank_weather_sources: { label: 'steps.tools.rank_weather_sources', stage: 'Погода' },
  fetch_weather: { label: 'steps.tools.fetch_weather', stage: 'Погода' },
  build_features: { label: 'steps.tools.build_features', stage: 'Подготовка' },
  run_forecast: { label: 'steps.tools.run_forecast', stage: 'Модель' },
  validate_forecast: { label: 'steps.tools.validate_forecast', stage: 'Анализ' },
  analyze_forecast: { label: 'steps.tools.analyze_forecast', stage: 'Анализ' },
  compare_with_previous: { label: 'steps.tools.compare_with_previous', stage: 'Пересчёт' },
  // v1 — backend/app/api/forecast.py (_steps)
  prepare_features: { label: 'steps.tools.prepare_features', stage: 'Подготовка' },
  run_model: { label: 'steps.tools.run_model', stage: 'Модель' },
  hourly_forecast: { label: 'steps.tools.hourly_forecast', stage: 'Прогноз' },
}

export function toolInfo(name: string | null | undefined): { label: string; stage: Stage | null } {
  if (!name) return { label: tr('steps.step'), stage: null }
  const tool = TOOLS[name] as (typeof TOOLS)[string] | undefined
  return tool ? { label: tr(tool.label), stage: tool.stage } : { label: name, stage: null }
}

/** Статус этапа по шагам ответа (по последней попытке): ok / error / pending. «Прогноз» у агента v2 входит в run_forecast. */
export function stageStatus(steps: { type: string; name?: string | null; ok?: boolean | null }[], stage: Stage) {
  const hits = steps.filter((s) => {
    if (s.type !== 'tool') return false
    const st = toolInfo(s.name).stage
    return st === stage || (stage === 'Прогноз' && s.name === 'run_forecast')
  })
  if (hits.length === 0) return 'pending' as const
  // статус последней попытки: если агент повторил шаг и повтор прошёл — этап зелёный
  return hits[hits.length - 1].ok === false ? ('error' as const) : ('ok' as const)
}

/** Попытка показать строку как отформатированный JSON; иначе — как есть. */
export function prettyMaybeJson(s: string | null | undefined): string {
  if (!s) return ''
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}
