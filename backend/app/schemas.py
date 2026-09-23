"""Pydantic-схемы запросов и ответов API (основа docs/api-contract.md)."""

from typing import Literal

from pydantic import BaseModel


class Health(BaseModel):
    status: str
    mode: str
    commit: str


# --- прогноз ВЭС (docs/api-contract.md) ---


class HourPoint(BaseModel):
    time: str  # "2026-02-10T13:00", местное время станции
    lead_day: Literal[1, 2]  # 1 — сутки D+1, 2 — сутки D+2 от момента прогноза
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


class Forecast(BaseModel):
    issue_date: str
    issued_at: str
    weather_source: str
    weather_runs: str
    hours: list[HourPoint]
    summary: ForecastSummary
    analysis: ForecastAnalysis
    explanation: str
    mode: Literal["live", "demo"]  # live — решения принимала LLM; demo — детерминированный цикл
    steps: list[AgentStep]


class ForecastIn(BaseModel):
    issue_date: str  # "2026-02-09"; формат и диапазон проверяет pipeline → 400


class BacktestIn(BaseModel):
    start: str = "2026-01-31"
    end: str = "2026-02-27"


class BacktestItem(BaseModel):
    issue_date: str
    energy_d1: float
    flags: list[str]


class BacktestOut(BaseModel):
    runs: int
    file: str | None  # CSV пишется только при прогоне всего тестового периода, иначе None
    forecasts: list[BacktestItem]


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
