"""Pydantic-схемы запросов и ответов API (основа docs/api-contract.md)."""

from typing import Any, Literal

from pydantic import BaseModel


class Health(BaseModel):
    status: str
    mode: str
    commit: str
    model: str = "cold"  # прогрев модели прогноза: cold | warming | ready | error


# --- прогноз ВЭС (docs/api-contract.md) ---


class HourPoint(BaseModel):
    time: str  # "2026-02-10T13:00", местное время станции
    lead_day: Literal[1, 2]  # 1 — сутки D+1, 2 — сутки D+2 от момента прогноза
    weather_run_days: Literal[1, 2, 3] | None = None  # из выпуска погоды за сколько суток до часа взяты значения
    p50: float  # прогноз мощности станции, 0–1
    p10: float
    p90: float
    t1: float | None = None  # прогноз по турбинам
    t2: float | None = None
    curve: float | None = None  # базовый метод «кривая мощности» — для сравнения на графике
    wind_100m: float | None  # прогнозный ветер 100 м из архивного прогноза; None — нет в выпуске
    actual: float | None = None  # факт, если есть в данных (до 31.01.2026)


class AgentStep(BaseModel):
    type: Literal["model", "tool"]
    name: str | None = None  # fetch_weather | prepare_features | run_model | hourly_forecast | analyze_forecast | …
    arguments: str | None = None
    output: str | None = None
    ok: bool | None = None
    content: str | None = None
    tool_calls: list[str] | None = None  # шаг модели (LIVE): какие инструменты она вызвала
    source: str | None = None  # шаг модели: live | cache
    ms: int


class ForecastSummary(BaseModel):
    energy_d1: float  # в «часах работы на полную мощность»
    energy_d2: float
    peak_hour: str
    low_hours: int
    interval_width: float | None = None


class ForecastAnalysis(BaseModel):
    flags: list[str]
    changed_vs_previous: float | None = None  # средний |Δp50| по суткам D+1 против прошлого выпуска
    update: dict[str, Any] | None = None  # детали пересчёта: прошлый выпуск, сутки, изменение энергии


class Card(BaseModel):
    """Карточка внимания диспетчера (passport.cards): пересмотр, широкий интервал, ненадёжный вход."""

    kind: str  # revision | wide_interval | input
    title: str
    hours: list[str]  # [первый час, последний час]
    value: float
    text: str
    rule: str
    action: str


class Forecast(BaseModel):
    issue_date: str
    issued_at: str
    weather_source: str
    weather_runs: str
    time_integrity: dict[str, Any] | None = None  # проверка «погода выпущена до момента прогноза»: ok, правило, выпуски
    excluded_sources: list[str] = []  # источники погоды, которые агент исключил
    hours: list[HourPoint]
    summary: ForecastSummary
    analysis: ForecastAnalysis
    explanation: str
    mode: Literal["live", "demo"]  # live — решения принимала LLM; demo — детерминированный планировщик
    steps: list[AgentStep]
    cards: list[Card] = []  # карточки внимания диспетчера
    passport: dict[str, Any] | None = None  # паспорт выпуска: forecast_id, входы, версии модели и калибровки, хеши
    fallback: bool | None = None  # LIVE, но цикл досчитал планировщик (фронт умеет вычислять сам по журналу)
    computed_at: str | None = None  # когда выпуск создан (passport.created_at)


class Station(BaseModel):
    name: str
    tz: str
    utc_offset: str


class Turbine(BaseModel):
    id: str
    lat: float
    lon: float


class DateRange(BaseModel):
    first: str
    last: str


class Meta(BaseModel):
    station: Station
    turbines: list[Turbine]
    issue_range: DateRange
    history_range: DateRange
    mode: Literal["live", "demo"]
    llm_model: str | None  # None в DEMO
    weather_sources: list[str]  # имена источников, как их называет агент (excluded_sources)
    model_ready: bool  # False — первый прогноз ждёт обучения модели (~1 мин)
    saved_forecasts: list[str]  # даты, для которых GET /api/forecast/{date} отдаст прогноз без пересчёта


class BacktestDay(BaseModel):
    issue_date: str
    energy_d1: float
    energy_d2: float
    low_hours: int
    flags: list[str]  # в CSV флаги не хранятся → []


class FinalHour(BaseModel):
    time: str
    p50: float
    p10: float
    p90: float
    issue_date: str


class Backtest(BaseModel):
    runs: int
    file: str
    final_file: str
    generated_at: str
    forecasts: list[BacktestDay]
    final_hours: list[FinalHour]


class HoldoutPoint(BaseModel):
    time: str
    lead_day: Literal[1, 2]
    p50: float
    p10: float  # интервал после конформной калибровки (как в прогнозе агента)
    p90: float
    curve: float
    actual: float | None


class HoldoutMae(BaseModel):
    model: float | None
    curve: float | None


class Holdout(BaseModel):
    issue_date: str
    hours: list[HoldoutPoint]
    mae: HoldoutMae


class ForecastIn(BaseModel):
    issue_date: str  # "2026-02-09"; формат и диапазон проверяет pipeline → 400


class BacktestIn(BaseModel):
    start: str = "2026-01-31"
    end: str = "2026-02-27"


class MetricRow(BaseModel):
    model: str
    lead: str | None = None  # "D+1" | "D+2"
    hours: int | None = None
    mae: float | None = None
    rmse: float | None = None
    nmae: float | None = None
    coverage: float | None = None  # строка «покрытие интервала p10–p90»


class MetricsOut(BaseModel):
    holdout: str
    rows: list[MetricRow]


class HistoryPoint(BaseModel):
    time: str
    actual: float | None  # нормированная мощность станции; None — час с неполными данными
    wind_measured: float | None


class HistoryOut(BaseModel):
    points: list[HistoryPoint]
