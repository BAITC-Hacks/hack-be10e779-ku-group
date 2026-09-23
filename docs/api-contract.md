# Контракт API — прогноз выработки ВЭС

> Утверждает Максим. Изменение — сообщение в чат + строка в `DECISIONS.md`. Все ответы — JSON; ошибки — `{"detail": "…"}` + HTTP-код.
> Время — местное станции (UTC+5), формат `YYYY-MM-DDTHH:MM`. Мощность — нормированная 0–1 (доля установленной мощности).

## Типы

```ts
type HourPoint = {
  time: string;          // "2026-02-10T13:00" — час, к которому относится значение
  lead_day: 1 | 2;       // 1 — сутки D+1, 2 — сутки D+2 от момента прогноза
  p50: number;           // прогноз мощности станции, 0–1
  p10: number; p90: number;   // интервал неуверенности
  t1?: number; t2?: number;   // прогноз по турбинам
  wind_100m: number;     // прогнозный ветер 100 м, м/с (из архивного прогноза)
  actual?: number | null // факт, если есть в данных (до 31.01.2026)
};

type AgentStep = {
  type: "model" | "tool";
  name?: string;         // имя инструмента: fetch_weather | prepare_features | run_model | analyze_forecast | compare_with_previous
  arguments?: string;
  output?: string;       // кратко
  ok?: boolean;
  content?: string;      // текст шага модели
  ms: number;
};

type Forecast = {
  issue_date: string;            // "2026-02-09" — прогноз сделан в конце этого дня
  issued_at: string;             // "2026-02-09T23:59"
  weather_source: string;        // "Open-Meteo Previous Runs API (best_match)"
  weather_runs: string;          // какие выпуски прогноза погоды использованы
  hours: HourPoint[];            // 48 часов: D+1 и D+2
  summary: { energy_d1: number; energy_d2: number; peak_hour: string; low_hours: number };
  analysis: { flags: string[]; changed_vs_previous?: number | null }; // проверки и сравнение с прошлым выпуском
  explanation: string;           // текст агента (LLM или шаблон без ключа)
  mode: "live" | "demo";         // live — решения принимала LLM; demo — детерминированный планировщик
  steps: AgentStep[];
};
```

## Эндпоинты

| Метод и путь | Тело / параметры | Ответ 200 |
| --- | --- | --- |
| `GET /health` | — | `{status, mode, commit}` |
| `POST /api/forecast` | `{ "issue_date": "2026-02-09" }` (31.01–27.02.2026) | `Forecast` |
| `POST /api/backtest` | `{ "start": "2026-01-31", "end": "2026-02-27" }` | `{ runs: number, file: "outputs/forecast_feb2026.csv", forecasts: {issue_date, energy_d1, flags}[] }` |
| `GET /api/metrics` | — | `{ holdout: "2026-01", rows: {model, mae, rmse, nmae}[] }` — наша модель против «кривой мощности» и «персистентности» |
| `GET /api/history` | `?start=2026-01-20&end=2026-01-31` | `{ points: {time, actual, wind_measured}[] }` — факт по станции почасово |

Ошибки: 400 — дата вне тестового периода или формат; 503 — погода недоступна и нет кэша; 500 — внутренняя.

## Демо-данные

- `data/raw/turbine1.csv`, `turbine2.csv` — история организатора.
- `data/weather/previous_runs.json` — сохранённый ответ Open-Meteo (для работы без интернета); код умеет скачать заново.
- Пример, проходящий весь сценарий: `issue_date = "2026-02-09"`.
