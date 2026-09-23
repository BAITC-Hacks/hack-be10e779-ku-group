// Инструменты агента → подпись и этап степпера. Бэкенд v1 (pipeline) и агент v2 называют шаги по-разному —
// поддерживаем оба набора имён; неизвестное имя показываем как есть.

export const STAGES = ['Погода', 'Подготовка', 'Модель', 'Прогноз', 'Анализ', 'Пересчёт'] as const
export type Stage = (typeof STAGES)[number]

const TOOLS: Record<string, { label: string; stage: Stage }> = {
  // v2 — backend/app/forecast/agent.py
  rank_weather_sources: { label: 'Оценка источников погоды', stage: 'Погода' },
  fetch_weather: { label: 'Архивный прогноз погоды', stage: 'Погода' },
  build_features: { label: 'Подготовка признаков', stage: 'Подготовка' },
  run_forecast: { label: 'Модель и почасовой прогноз', stage: 'Модель' },
  validate_forecast: { label: 'Проверка результата перед выдачей', stage: 'Анализ' },
  analyze_forecast: { label: 'Анализ результата', stage: 'Анализ' },
  compare_with_previous: { label: 'Пересчёт: сравнение с прошлым выпуском', stage: 'Пересчёт' },
  // v1 — backend/app/api/forecast.py (_steps)
  prepare_features: { label: 'Подготовка признаков', stage: 'Подготовка' },
  run_model: { label: 'Модель выработки', stage: 'Модель' },
  hourly_forecast: { label: 'Почасовой прогноз', stage: 'Прогноз' },
}

export function toolInfo(name: string | null | undefined): { label: string; stage: Stage | null } {
  if (!name) return { label: 'Шаг', stage: null }
  return TOOLS[name] ?? { label: name, stage: null }
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
