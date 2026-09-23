"""API прогноза ВЭС (docs/api-contract.md): POST /api/forecast, POST /api/backtest, GET /api/metrics, GET /api/history.

Тонкий слой над app.forecast: вызывает цикл ТЗ, приводит результат к схемам app/schemas.py, ошибки — {"detail"} + код.
Пока агента нет, /api/forecast вызывает pipeline.full_cycle; замена на агента — в функции run_cycle.
"""

import json
from datetime import date, datetime, timedelta

import httpx
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from app.config import ROOT_DIR
from app.forecast import cli, data, model, pipeline
from app.schemas import (
    AgentStep,
    BacktestIn,
    BacktestItem,
    BacktestOut,
    Forecast,
    ForecastIn,
    HistoryOut,
    HistoryPoint,
    MetricsOut,
)

router = APIRouter(tags=["forecast"])

METRICS_FILE = ROOT_DIR / "outputs" / "metrics.json"
BACKTEST_FILE = "outputs/forecast_feb2026.csv"
HISTORY_MAX_DAYS = 93


def run_cycle(issue_date: str) -> dict:
    """Точка замены: сейчас детерминированный цикл, позже — агент."""
    return pipeline.full_cycle(issue_date)


def _call(fn, *args):
    """ValueError цикла → 400, недоступная погода без кэша → 503; остальное — глобальный обработчик 500."""
    try:
        return fn(*args)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=503, detail="Архив прогнозов погоды недоступен, а сохранённой копии нет"
        ) from exc


def _steps(res: dict) -> list[AgentStep]:
    """Шаги цикла из результата full_cycle. Время шагов цикл пока не отдаёт — ms=0 (появится с агентом)."""
    w, s, upd = res["weather"], res["summary"], res["update"]
    return [
        AgentStep(
            type="tool",
            name="fetch_weather",
            ok=True,
            ms=0,
            arguments=json.dumps({"issue_date": res["issue_date"]}),
            output=f"{w['source']}: {w['hours']} ч, пропусков {w['missing_hours']}, "
            f"ветер 100 м средний {w['wind_100m_mean']} м/с, максимум {w['wind_100m_max']} м/с",
        ),
        AgentStep(
            type="tool", name="prepare_features", ok=True, ms=0, output=f"признаки на {len(res['hours'])} ч (D+1 и D+2)"
        ),
        AgentStep(
            type="tool",
            name="run_model",
            ok=True,
            ms=0,
            output="прогноз станции p10/p50/p90, по турбинам и кривая мощности",
        ),
        AgentStep(
            type="tool",
            name="hourly_forecast",
            ok=True,
            ms=0,
            output=f"D+1: {s['energy_d1']} ч на полной мощности, D+2: {s['energy_d2']} ч, пик {s['peak_hour']}",
        ),
        AgentStep(
            type="tool",
            name="analyze_forecast",
            ok=True,
            ms=0,
            output="; ".join(res["flags"]) or "проверки пройдены, замечаний нет",
        ),
        AgentStep(
            type="tool",
            name="compare_with_previous",
            ok=True,
            ms=0,
            output=f"сутки {upd['day']} против выпуска {upd['previous_issue']}: "
            f"средний сдвиг {upd['mean_abs_change']}, максимум {upd['max_abs_change']}",
        ),
    ]


def _explanation(res: dict) -> str:
    """Объяснение по шаблону (без LLM): что ждать, где пик, на что обратить внимание, что изменилось."""
    s, upd = res["summary"], res["update"]
    parts = [
        f"Прогноз от {res['issue_date']} (шаблон без LLM). Сутки D+1: {s['energy_d1']} ч работы на полной мощности "
        f"(средняя загрузка {s['energy_d1'] / 24:.0%}); D+2: {s['energy_d2']} ч ({s['energy_d2'] / 24:.0%}).",
        f"Пик выработки — {s['peak_hour']}; часов почти без выработки — {s['low_hours']}.",
    ]
    if res["flags"]:
        parts.append("Внимание: " + "; ".join(res["flags"]) + ".")
    change = "существенно" if upd["significant"] else "незначительно"
    parts.append(
        f"Относительно выпуска {upd['previous_issue']} прогноз на {upd['day']} изменился {change}: "
        f"{upd['energy_old']} → {upd['energy_new']} ч."
    )
    return " ".join(parts)


def to_forecast(res: dict) -> Forecast:
    return Forecast(
        issue_date=res["issue_date"],
        issued_at=f"{res['issue_date']}T23:59",
        weather_source=res["weather"]["source"],
        weather_runs=res["weather"]["runs"],
        hours=res["hours"],
        summary=res["summary"],
        analysis={"flags": res["flags"], "changed_vs_previous": res["update"]["mean_abs_change"]},
        explanation=_explanation(res),
        mode="demo",
        steps=_steps(res),
    )


@router.post("/forecast", response_model=Forecast)
def forecast(body: ForecastIn) -> Forecast:
    return to_forecast(_call(run_cycle, body.issue_date))


@router.post("/backtest", response_model=BacktestOut)
def backtest(body: BacktestIn) -> BacktestOut:
    start = _call(pipeline.check_issue_date, body.start)
    end = _call(pipeline.check_issue_date, body.end)
    if start > end:
        raise HTTPException(status_code=400, detail="Начало периода позже конца")
    items = []
    for d in pd.date_range(start, end, freq="1D"):
        res = _call(run_cycle, d.strftime("%Y-%m-%d"))
        items.append(
            BacktestItem(issue_date=res["issue_date"], energy_d1=res["summary"]["energy_d1"], flags=res["flags"])
        )
    # общий файл результатов перезаписываем только полным прогоном, чтобы частичный запрос его не испортил
    full = start == pipeline.FIRST_ISSUE and end == pipeline.LAST_ISSUE
    if full:
        _call(cli.backtest, body.start, body.end)
    return BacktestOut(runs=len(items), file=BACKTEST_FILE if full else None, forecasts=items)


@router.get("/metrics", response_model=MetricsOut)
def metrics() -> MetricsOut:
    if METRICS_FILE.is_file():
        return MetricsOut(**json.loads(METRICS_FILE.read_text(encoding="utf-8")))
    return MetricsOut(**model.holdout_metrics())


def _day(value: str, name: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{name}: дата в формате YYYY-MM-DD") from exc


def _num(v) -> float | None:
    return None if pd.isna(v) else round(float(v), 4)


@router.get("/history", response_model=HistoryOut)
def history(start: str = Query("2026-01-20"), end: str = Query("2026-01-31")) -> HistoryOut:
    """Факт по станции почасово: нормированная мощность (среднее двух турбин) и измеренный ветер."""
    a, b = _day(start, "start"), _day(end, "end")
    if a > b:
        raise HTTPException(status_code=400, detail="start позже end")
    if (b - a).days + 1 > HISTORY_MAX_DAYS:
        raise HTTPException(status_code=400, detail=f"Не больше {HISTORY_MAX_DAYS} дней за запрос")
    df = data.load_hourly()
    first, last = df.index.min().date(), df.index.max().date()
    if b < first or a > last:
        raise HTTPException(status_code=400, detail=f"Факт есть с {first} по {last}")
    rows = df.loc[pd.Timestamp(a) : pd.Timestamp(b + timedelta(days=1)) - pd.Timedelta(hours=1), ["power", "wind"]]
    return HistoryOut(
        points=[
            HistoryPoint(time=t.strftime("%Y-%m-%dT%H:%M"), actual=_num(r.power), wind_measured=_num(r.wind))
            for t, r in rows.iterrows()
        ]
    )
