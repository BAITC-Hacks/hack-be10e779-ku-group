// Словарь «steps» (ru) — этапы агентного цикла и подписи инструментов. Источник ключей для kk и en.
export default {
  step: 'Шаг',
  stages: {
    weather: 'Погода',
    prep: 'Подготовка',
    model: 'Модель',
    forecast: 'Прогноз',
    analysis: 'Анализ',
    update: 'Пересчёт',
  },
  tools: {
    rank_weather_sources: 'Оценка источников погоды',
    fetch_weather: 'Архивный прогноз погоды',
    build_features: 'Подготовка признаков',
    run_forecast: 'Модель и почасовой прогноз',
    validate_forecast: 'Проверка результата перед выдачей',
    analyze_forecast: 'Анализ результата',
    compare_with_previous: 'Пересчёт: сравнение с прошлым выпуском',
    prepare_features: 'Подготовка признаков',
    run_model: 'Модель выработки',
    hourly_forecast: 'Почасовой прогноз',
  },
} as const
