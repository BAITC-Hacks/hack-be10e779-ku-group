# Контракт API — прогноз выработки ВЭС (v2)

> v1 — Максим (216b576). v2 — Оксана, 23.09 ~14:20: расширение под экраны из `docs/design-brief.md` и **сверка с фактическим кодом**
> (`backend/app/forecast/agent.py`, `pipeline.py`, `cli.py`, `outputs/*`). Всё из v1 сохранено, поля только добавлены.
> Утверждает Максим. Изменение — сообщение в чат + строка в `DECISIONS.md`.
>
> Общие правила: все ответы — JSON (кроме скачивания CSV); ошибки — `{"detail": "понятный текст по-русски"}` + HTTP-код.
> Время — местное станции UTC+5, формат `YYYY-MM-DDTHH:MM`, без смещения. Мощность — доля номинала 0–1 (в UI — «42 %»).
> Энергия — «часы работы на полную мощность» (сумма p50 по часам; МВт в данных нет).

## Приоритеты

| # | Эндпоинт | Зачем фронту | Статус бэка | P |
| --- | --- | --- | --- | --- |
| 1 | `GET /health` | бейдж DEMO/LIVE, «сервер жив» | есть в `main.py` | P0 |
| 2 | `GET /api/meta` | границы дат, координаты турбин, источники погоды, модель LLM, прогрет ли агент | нужно сделать | P0 |
| 3 | `POST /api/forecast` | «Сделать прогноз»: полный цикл агента, ответ `Forecast` | логика есть (`agent.run`), роутера нет | P0 |
| 4 | `GET /api/forecast/{issue_date}` | открыть уже посчитанный прогноз (клик по дню в календаре, F5) без повторного запуска | нужно сделать (сохранять `outputs/runs/{issue_date}.json`) | P0 |
| 5 | `GET /api/backtest` | вкладка «Февраль»: 28 выпусков из готового `outputs/forecast_feb2026.csv` — мгновенно | нужно сделать (читать CSV) | P0 |
| 6 | `POST /api/backtest` | кнопка «Прогнать весь февраль заново» | логика есть (`cli.backtest`), ~30 с | P0 |
| 7 | `GET /api/backtest/csv` | «Скачать CSV» | нужно сделать (`FileResponse`) | P0 |
| 8 | `GET /api/metrics` | вкладка «Качество»: модель vs кривая мощности vs персистентность + калибровка интервала | есть `outputs/metrics.json`, `outputs/calibration.json` | P0 |
| 9 | `GET /api/history` | факт станции почасово (январь и раньше) — линия «реально» | логика есть (`agent.history`) | P0 |
| 10 | `GET /api/holdout` | «ожидалось / реально» на январе: прогноз модели + кривая + факт по часам | нужно сделать (из `calibrate._month_predictions("2026-01")`) | P1 |
| 11 | `POST /api/jobs/forecast` + `GET /api/jobs/{id}` | живой журнал агента по шагам (LIVE-прогон ~20–60 с, первый вызов ~50 с) | нужен колбэк шагов в `run_agent` | P1 |

P0 — без этого экраны не работают. P1 — делаем, если P0 прошёл smoke. Без P1 фронт показывает спиннер, а журнал целиком
после ответа (проигрываем шаги анимацией с реальными `ms`).

## Типы

```ts
// ---------- прогноз ----------
type HourPoint = {
  time: string;            // "2026-02-10T13:00" — час, к которому относится значение
  lead_day: 1 | 2;         // сутки D+1 / D+2 от момента прогноза
  p50: number;             // прогноз мощности станции, 0–1 (основная линия)
  p10: number; p90: number;// калиброванный интервал неуверенности (цель покрытия 80 %, на январе 74,5 %)
  t1: number; t2: number;  // прогноз по турбинам, 0–1
  curve: number;           // базовый метод «кривая мощности по прогнозному ветру», 0–1 — пунктир на графике
  wind_100m: number | null;// прогнозный ветер 100 м, м/с (из архивного прогноза); null — пропуск
  actual: number | null;   // факт станции, если есть в данных (для февраля всегда null)
};

type AgentStep =
  | { type: "model"; content: string; tool_calls?: string[]; source?: string; ms: number }   // ход LLM (LIVE) или
                                                                                            // служебная запись («LLM не завершила цикл — дошёл планировщик»)
  | { type: "tool"; name: ToolName; arguments: string; output: string; ok: boolean; ms: number };
// arguments/output — строки, ОБЫЧНО JSON, но не всегда: output обрезается (1500 симв. DEMO / 2000 LIVE), ошибка инструмента —
// обычный текст, в LIVE arguments — сырая строка от LLM. Фронт: JSON.parse в try, иначе показать как текст.

type ToolName =                          // подпись в UI (этап степпера)
  | "rank_weather_sources"                // «Оценка источников погоды» (Погода)
  | "fetch_weather"                       // «Архивный прогноз погоды + проверка времени» (Погода)
  | "build_features"                      // «Подготовка признаков» (Подготовка)
  | "run_forecast"                        // «Модель и почасовой прогноз» (Модель → Прогноз)
  | "analyze_forecast"                    // «Анализ результата» (Анализ)
  | "compare_with_previous";              // «Пересчёт: сравнение с прошлым выпуском» (Пересчёт)

type TimeIntegrity = {                   // бейдж «погода выпущена до момента прогноза»
  issued_at: string;                     // "2026-02-09T23:59" — момент прогноза (конец дня D). Код сейчас отдаёт "2026-02-09 23:59:00" → привести
  latest_weather_run_used: string;       // самый поздний использованный выпуск погоды
  ok: boolean;                           // true ⇔ выпуск не позже момента прогноза; false — прогноз недействителен (красный бейдж)
  rule: string;                          // текст правила для подсказки
};
// ВАЖНО для честной подписи: latest_weather_run_used сейчас ВЫЧИСЛЯЕТСЯ по определению previous_day1/2 (час − 24/48 ч),
// а не читается из данных; задержка публикации выпуска не учтена. В UI: «по определению архива Open-Meteo», не «проверено по данным».

type Summary = {
  energy_d1: number; energy_d2: number;  // часы работы на полную мощность за сутки D+1 / D+2 (0–24)
  peak_hour: string;                     // час максимума p50
  low_hours: number;                     // часов с p50 < 0.05 («штиль») из 48
  interval_width: number;                // средняя ширина p10–p90
};

type UpdateInfo = {                      // «повторный расчёт при обновлении входа»
  previous_issue: string;                // "2026-02-08" — вчерашний выпуск
  day: string;                           // "2026-02-10" — сутки, которые сравниваем (вчера были D+2, сегодня D+1)
  mean_abs_change: number;               // среднее |Δp50|, доля номинала
  max_abs_change: number;
  energy_old: number; energy_new: number;// часы на номинале: по старой погоде → по свежей
  significant: boolean;                  // mean_abs_change > 0.05 → плашка «прогноз заметно изменился»
};

type Forecast = {
  issue_date: string;                    // "2026-02-09" — прогноз сделан в конце этого дня
  issued_at: string;                     // "2026-02-09T23:59"
  weather_source: string;                // "Open-Meteo Previous Runs API (…) + ансамбль ECMWF/ICON/GFS/JMA/CMA/GEM"
  weather_runs: string;                  // человеческое описание выпусков
  time_integrity: TimeIntegrity;
  excluded_sources: string[];            // колонки-источники, которые агент исключил, напр. ["gfs_ws100"] (причина — в шаге rank_weather_sources)
  hours: HourPoint[];                    // ровно 48: сутки D+1 и D+2
  summary: Summary;
  analysis: {
    flags: string[];                     // предупреждения по-русски, готовые к показу (пусто — «Замечаний нет»)
    changed_vs_previous: number | null;  // = update.mean_abs_change (v1)
    update: UpdateInfo;
  };
  explanation: string;                   // объяснение для диспетчера (LLM в LIVE, шаблон в DEMO)
  mode: "live" | "demo";                 // кто принимал решения: LLM или детерминированный планировщик
  fallback: boolean;                     // НОВОЕ (нужно в коде): true — ключ есть, но LLM не завершила цикл, досчитал планировщик
                                         // → бейдж «LIVE · резерв: планировщик»
  steps: AgentStep[];
  computed_at?: string;                  // когда посчитан (для GET сохранённого прогноза)
};

// ---------- мета ----------
type Meta = {
  station: { name: string; tz: "Asia/Almaty"; utc_offset: "+05:00" };
  turbines: { id: "t1" | "t2"; lat: number; lon: number }[];   // 43.645150, 78.535604 / 43.643198, 78.538828
  issue_range: { first: "2026-01-31"; last: "2026-02-27" };
  history_range: { first: string; last: string };             // "2023-03-11T00:00" … "2026-01-31T23:00"
  mode: "live" | "demo";
  llm_model: string | null;                                    // null в DEMO
  weather_sources: string[];                                   // реальные имена колонок: ["best_match_ws100", "ecmwf_ws100", "icon_ws100", "gfs_ws100", "ecmwf_ws10", …]
  model_ready: boolean;                                        // false — первый прогноз займёт ~50 с (обучение), показать предупреждение
  saved_forecasts: string[];                                   // даты, для которых есть outputs/runs/{date}.json
};

// ---------- бэктест февраля ----------
type BacktestDay = {
  issue_date: string;                    // 28 шт.: 2026-01-31 … 2026-02-27
  energy_d1: number; energy_d2: number;
  low_hours: number;
  flags: string[];                       // может быть [] если читаем из CSV (флаги в CSV не хранятся) — см. вопрос 3
};
type Backtest = {
  runs: number;                          // 28
  file: "outputs/forecast_feb2026.csv";
  final_file: "outputs/forecast_feb2026_final.csv";   // каждый час февраля — свежайший прогноз (D+1)
  generated_at: string;                  // время файла
  forecasts: BacktestDay[];
  final_hours: { time: string; p50: number; p10: number; p90: number; issue_date: string }[]; // 672 ч февраля — для полосы месяца
};

// ---------- метрики ----------
type MetricRow = { lead: "D+1" | "D+2"; model: string; hours: number; mae: number; rmse: number; nmae: number };
type Metrics = {
  holdout: string;                       // "2025-10…2026-01, скользящее окно" (CASE A5 хочет январь 2026 — см. вопрос 5)
  rows: MetricRow[];                     // модель / «Кривая мощности» / «Персистентность» × D+1, D+2
  coverage: { "D+1": number; "D+2": number };   // покрытие p10–p90 на том же окне, БЕЗ калибровки (0.692 / 0.68).
                                         // В metrics.json сейчас это 2 лишние строки в rows с полем coverage — роутер выносит их сюда
  calibration: {                         // = outputs/calibration.json
    method: string; target: number;
    coverage_before: number; coverage_after: number;
    width_before: number; width_after: number;
  };
};

// ---------- история и отложенная выборка ----------
type HistoryPoint = { time: string; actual: number | null; wind_measured: number | null };
type HoldoutPoint = { time: string; lead_day: 1 | 2; p50: number; p10: number; p90: number; curve: number; actual: number | null };
```

## Эндпоинты

| Метод и путь | Тело / параметры | Ответ 200 | Ошибки |
| --- | --- | --- | --- |
| `GET /health` | — | `{status, mode, commit}` | — |
| `GET /api/meta` | — | `Meta` | — |
| `POST /api/forecast` | `{ "issue_date": "2026-02-09" }` | `Forecast`; сохраняется в `outputs/runs/{issue_date}.json` | 400 дата вне 31.01–27.02 / формат; 503 погода недоступна и нет кэша; 500 |
| `GET /api/forecast/{issue_date}` | — | сохранённый `Forecast` + `computed_at` | 404 «Прогноз на эту дату ещё не делали» → фронт показывает кнопку «Сделать прогноз» |
| `GET /api/backtest` | — | `Backtest` из готовых CSV | 404 «Ретроспективный прогон ещё не выполнялся» |
| `POST /api/backtest` | — (всегда весь период 31.01–27.02; частичный прогон перезаписал бы CSV неполным набором) | `Backtest` (перезаписывает CSV; ~30 с) | 409 «Прогон уже идёт» |
| `GET /api/backtest/csv` | `?kind=all` (1 344 строки: 28 выпусков × 48 ч) \| `?kind=final` (672 строки) | `text/csv`, `Content-Disposition: attachment` | 404 |
| `GET /api/metrics` | — | `Metrics` | 404 «Метрики не посчитаны: python -m app.forecast.cli metrics» |
| `GET /api/history` | `?start=2026-01-20&end=2026-01-31` (≤ 62 дней) | `{ points: HistoryPoint[] }` | 400 диапазон |
| `GET /api/holdout` (P1) | `?issue_date=2026-01-20` (выпуски 2026-01-01…2026-01-29; источник — `calibrate._month_predictions("2026-01")` + `apply`, не `holdout_metrics`) | `{ issue_date, hours: HoldoutPoint[], mae: {model, curve} }` | 400; 404 |
| `POST /api/jobs/forecast` (P1) | `{ "issue_date": "…" }` | `202 { job_id }` | 400; 409 если по этой дате уже идёт |
| `GET /api/jobs/{job_id}` (P1) | `?since=<число шагов, уже показанных>` | `{ status: "running" \| "done" \| "failed", steps: AgentStep[] /* новые */, result?: Forecast, detail?: string }` | 404 |

**Валидация `issue_date` в роутере:** строго `^\d{4}-\d{2}-\d{2}$`, затем `check_issue_date`; путь файла строится из
нормализованной даты (`d.strftime`) и проверяется `resolve().is_relative_to(outputs/runs)` — защита от path traversal.
**Коды:** `ValueError` → 400, `httpx.HTTPError` (нет сети и нет кэша) → 503, повторный запрос на ту же дату во время расчёта → 409.

**Форматы CSV (реальные колонки):** `forecast_feb2026.csv` — `issue_date,issued_at,time,lead_day,p50,p10,p90,t1,t2,curve,wind_100m,actual`
(1 344 строки); `forecast_feb2026_final.csv` — `time,p50,p10,p90,t1,t2,issue_date` (672 строки). Формат в брифе §5.8 устарел — верен этот.

Поллинг для P1 — раз в 1 с, пока `status == "running"`. Ошибка внутри прогона — `status: "failed"` + `detail`, не HTTP-код.

## Примеры

`POST /api/forecast` `{"issue_date":"2026-02-09"}` → (сокращено)

```json
{
  "issue_date": "2026-02-09",
  "issued_at": "2026-02-09T23:59",
  "weather_source": "Open-Meteo Previous Runs API + ансамбль ECMWF/ICON/GFS/JMA/CMA/GEM",
  "weather_runs": "D+1 — выпуск ≈ за 24 ч до часа, D+2 — ≈ за 48 ч; все выпуски не позже 2026-02-09 23:59",
  "time_integrity": {"issued_at": "2026-02-09T23:59", "latest_weather_run_used": "2026-02-09T23:00", "ok": true,
                     "rule": "D+1 ← выпуск за 24 ч до часа, D+2 ← за 48 ч; фактическая погода не используется"},
  "excluded_sources": ["gfs_ws100"],
  "hours": [{"time": "2026-02-10T00:00", "lead_day": 1, "p50": 0.41, "p10": 0.18, "p90": 0.72, "t1": 0.43, "t2": 0.39,
             "curve": 0.47, "wind_100m": 8.3, "actual": null}],
  "summary": {"energy_d1": 9.8, "energy_d2": 6.1, "peak_hour": "2026-02-10T15:00", "low_hours": 11, "interval_width": 0.46},
  "analysis": {"flags": ["Модели погоды расходятся (разброс ветра 100 м в среднем 1.8 м/с) — прогноз менее надёжен"],
               "changed_vs_previous": 0.063,
               "update": {"previous_issue": "2026-02-08", "day": "2026-02-10", "mean_abs_change": 0.063, "max_abs_change": 0.21,
                          "energy_old": 8.4, "energy_new": 9.8, "significant": true}},
  "explanation": "Прогноз на 2026-02-10 и следующие сутки. Ожидаемая выработка: D+1 — 9.8 ч, …",
  "mode": "demo",
  "fallback": false,
  "steps": [{"type": "tool", "name": "rank_weather_sources", "arguments": "{\"issue_date\": \"2026-02-09\"}",
             "output": "{\"measured_until\": …}", "ok": true, "ms": 412}]
}
```

Числа в примере — иллюстрация формата, не результат.

## Как фронт отображает (связка с `docs/design-brief.md`)

- Шаг `type: "tool"` → строка журнала «→ Архивный прогноз погоды» + `ms`; `ok: false` → красная строка. `arguments`/`output` —
  свёрнутый JSON по клику. Шаг `type: "model"` → «LLM: {content}» (LIVE) или служебная запись серым.
- Степпер из 6 этапов закрашивается по именам инструментов в `steps` (таблица `ToolName` выше); повторный `fetch_weather`
  после `analyze_forecast` = стрелка возврата «пересчёт с исключённым источником».
- `time_integrity.ok` → зелёный бейдж «Погода выпущена до момента прогноза ✓ (последний выпуск {latest_weather_run_used})»;
  `false` → красный, график приглушён.
- `analysis.update.significant` → плашка «Прогноз на {day} изменился: {energy_old} → {energy_new} ч на номинале».
- `mode` → бейдж «DEMO · без LLM» / «LIVE · LLM: {meta.llm_model}».
- `meta.model_ready == false` → под кнопкой «Первый прогноз займёт около минуты: модель обучается».

## Открытые вопросы и правки кода (к Максиму) — по итогам агента-оценщика

0. **Блокер — Docker:** `outputs/` не копируется в образ, `/app` не доступен на запись пользователю `app` → в контейнере
   `/api/backtest` и `/api/metrics` = 404, `calibrate.load()` уходит в долгий `build()` и падает на `mkdir` → 500 на любом прогнозе.
   Нужно: `COPY outputs/ outputs/` + `chown app /app/outputs`; прогрев `get_forecaster()` и `calibrate.load()` в `lifespan`.
5. Метрики за январь 2026 отдельно (CASE A5, DoD) — сейчас только окно окт–янв. Покрытие 0.692 (4 мес., без калибровки)
   и 0.745 (январь, после) — подписывать, что к чему относится.
6. `fallback` в ответе `agent.run`; `time_integrity.issued_at` в формате `YYYY-MM-DDTHH:MM`; тест `test_no_future_weather` (обещан в DoD).
7. Потокобезопасность: `_state` и прогрев модели без блокировок — два запроса на одну дату портят состояние → `threading.Lock` + 409.
8. Синхронный LIVE-прогон может идти 2–4 мин (LLM-таймауты + резерв с нуля) → 504 за прокси. Если LIVE показываем судьям — jobs (№11) в P0.

1. `outputs/runs/{date}.json` — сохранять ли каждый прогон (нужно для `GET /api/forecast/{date}` и календаря)? Предлагаю да.
2. `MAX_STEPS = 8` в `app/ai/agent.py`: LIVE-цикл = 6 инструментов + ходы модели + возможный повтор шагов 2–5 — может упереться
   в лимит (тогда сработает резерв-планировщик, но в журнале будет «LLM не завершила цикл»). Предлагаю 14.
3. Флаги в бэктесте: `cli.backtest` пишет их только в консоль. Для календаря февраля (жёлтые дни) нужно сохранять
   `outputs/backtest_summary.json` (`BacktestDay[]`).
4. `cli.backtest` использует `pipeline.full_cycle` (без агента, без калибровки интервала и исключения источников), а
   `POST /api/forecast` — `agent.run` (с ними). Числа в календаре и на вкладке «Прогноз» для одной даты будут различаться.
   Нужно одно из двух: бэктест через `agent._deterministic`, или честная подпись в UI.
