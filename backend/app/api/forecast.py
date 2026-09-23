"""API прогноза ВЭС (docs/api-contract.md): POST /api/forecast, POST /api/backtest, GET /api/metrics, GET /api/history.

Тонкий слой над app.forecast: /api/forecast — агент (app.forecast.agent.run), ответ по схемам app/schemas.py,
ошибки — {"detail"} + код. Модель обучается ~60 с, поэтому при старте её прогревают в фоне (warm_up, см. main.py);
запрос, пришедший во время прогрева, ждёт его окончания, а не обучает модель второй раз.
"""

import json
import logging
import threading
from datetime import date, datetime, timedelta

import httpx
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from app.config import ROOT_DIR
from app.forecast import agent, calibrate, cli, data, model, pipeline
from app.schemas import (
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
log = logging.getLogger("app")

METRICS_FILE = ROOT_DIR / "outputs" / "metrics.json"
BACKTEST_FILE = "outputs/forecast_feb2026.csv"
HISTORY_MAX_DAYS = 93
WARM_TIMEOUT_S = 300

warm = {"state": "cold"}  # cold → warming → ready | error; показывается в /health
_warm_done = threading.Event()


def warm_up() -> None:
    """Обучить модель и загрузить калибровку заранее (вызывается в фоне при старте приложения)."""
    if warm["state"] in ("warming", "ready"):
        return
    warm["state"] = "warming"
    try:
        model.get_forecaster()
        calibrate.load()
        warm["state"] = "ready"
    except Exception:
        log.exception("Прогрев модели не удался — модель обучится при первом запросе")
        warm["state"] = "error"
    finally:
        _warm_done.set()


def run_cycle(issue_date: str) -> dict:
    """Полный цикл ТЗ через агента: LIVE — шаги выбирает LLM, DEMO — детерминированный планировщик."""
    if warm["state"] == "warming":
        _warm_done.wait(WARM_TIMEOUT_S)
    return agent.run(issue_date)


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


@router.post("/forecast", response_model=Forecast)
def forecast(body: ForecastIn) -> Forecast:
    return Forecast(**_call(run_cycle, body.issue_date))


@router.post("/backtest", response_model=BacktestOut)
def backtest(body: BacktestIn) -> BacktestOut:
    start = _call(pipeline.check_issue_date, body.start)
    end = _call(pipeline.check_issue_date, body.end)
    if start > end:
        raise HTTPException(status_code=400, detail="Начало периода позже конца")
    if warm["state"] == "warming":
        _warm_done.wait(WARM_TIMEOUT_S)
    # бэктест — детерминированный цикл pipeline, тот же, которым cli.backtest пишет CSV (без LLM: 28 выпусков подряд)
    items = []
    for d in pd.date_range(start, end, freq="1D"):
        res = _call(pipeline.full_cycle, d.strftime("%Y-%m-%d"))
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
