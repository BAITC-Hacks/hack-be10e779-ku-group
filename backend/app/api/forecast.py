"""API прогноза ВЭС (docs/api-contract.md, v2): meta, forecast (POST и GET сохранённого), backtest (GET, POST, CSV),
metrics, history, holdout.

Тонкий слой над app.forecast: /api/forecast — агент (app.forecast.agent.run), ответ по схемам app/schemas.py,
ошибки — {"detail"} + код. Модель обучается ~60 с, поэтому при старте её прогревают в фоне (warm_up, см. main.py);
запрос, пришедший во время прогрева, ждёт его окончания, а не обучает модель второй раз.
"""

import json
import logging
import re
import threading
from datetime import date, datetime, timedelta

import httpx
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.ai.llm import LLMClient
from app.config import ROOT_DIR, settings
from app.forecast import agent, calibrate, cli, data, model, passport, pipeline, weather
from app.schemas import (
    Backtest,
    BacktestIn,
    Forecast,
    ForecastIn,
    HistoryOut,
    HistoryPoint,
    Holdout,
    Meta,
    MetricsOut,
)

router = APIRouter(tags=["forecast"])
log = logging.getLogger("app")

OUTPUTS = ROOT_DIR / "outputs"
METRICS_FILE = OUTPUTS / "metrics.json"
BACKTEST_FILE = "outputs/forecast_feb2026.csv"
BACKTEST_CSV = {"all": OUTPUTS / "forecast_feb2026.csv", "final": OUTPUTS / "forecast_feb2026_final.csv"}
HOLDOUT_FILE = OUTPUTS / "holdout_jan2026.csv"
HOLDOUT_META = (
    OUTPUTS / "holdout_jan2026.json"
)  # хеш калибровки, с которой посчитан holdout — чтобы не отдать устаревший
HOLDOUT_ISSUES = (pd.Timestamp("2026-01-01"), pd.Timestamp("2026-01-29"))  # D+2 последнего выпуска — 31.01
HISTORY_MAX_DAYS = 62
WARM_TIMEOUT_S = 300
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

_holdout_lock = threading.Lock()
_backtest_lock = threading.Lock()  # один прогон февраля за раз

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


def _issue(value: str) -> str:
    """Дата выпуска: строго YYYY-MM-DD и тестовый период ТЗ; возвращается нормализованной."""
    if not DATE_RE.match(value):
        raise HTTPException(status_code=400, detail="Дата прогноза в формате YYYY-MM-DD")
    return _call(pipeline.check_issue_date, value).strftime("%Y-%m-%d")


OFFICIAL_MODE = "deterministic"  # официальный прогон февраля (планировщик без LLM) — календарь и CSV


def _latest(issue_date: str, execution_mode: str | None = None) -> dict | None:
    """Последняя по времени файла версия выпуска из outputs/forecasts; `execution_mode` — только версии этого режима
    (passport.execution_mode: deterministic | llm)."""
    for path in sorted(passport.STORE.glob(f"{issue_date}_*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        stored = json.loads(path.read_text(encoding="utf-8"))
        if execution_mode is None or stored["passport"].get("execution_mode") == execution_mode:
            return stored
    return None


def _saved(stored: dict) -> Forecast:
    """Сохранённый выпуск из outputs/forecasts: прогноз + паспорт; computed_at — когда выпуск создан."""
    return Forecast(**stored["forecast"], passport=stored["passport"], computed_at=stored["passport"]["created_at"])


@router.post("/forecast", response_model=Forecast)
def forecast(body: ForecastIn) -> Forecast:
    """Полный цикл агента; выпуск сохраняется агентом в outputs/forecasts (неизменяемая версия с паспортом)."""
    res = _call(run_cycle, body.issue_date)
    return Forecast(**res, computed_at=(res.get("passport") or {}).get("created_at"))


@router.get("/forecast/{issue_date}", response_model=Forecast)
def saved_forecast(issue_date: str) -> Forecast:
    """Последняя сохранённая версия выпуска любого режима (в т. ч. LIVE) — без пересчёта; режим — в passport."""
    stored = _latest(_issue(issue_date))
    if stored is None:
        raise HTTPException(status_code=404, detail="Прогноз на эту дату ещё не делали")
    return _saved(stored)


def _saved_dates() -> list[str]:
    return sorted({p.name[:10] for p in passport.STORE.glob("*.json") if DATE_RE.match(p.name[:10])})


@router.get("/meta", response_model=Meta)
def meta() -> Meta:
    hist = data.load_hourly()["power"].dropna()
    llm = LLMClient()
    return Meta(
        station={"name": "ВЭС, 2 турбины (Алматинская обл.)", "tz": "Asia/Almaty", "utc_offset": "+05:00"},
        turbines=[{"id": k, "lat": lat, "lon": lon} for k, (lat, lon) in data.TURBINES.items()],
        issue_range={
            "first": pipeline.FIRST_ISSUE.strftime("%Y-%m-%d"),
            "last": pipeline.LAST_ISSUE.strftime("%Y-%m-%d"),
        },
        history_range={
            "first": hist.index.min().strftime("%Y-%m-%dT%H:%M"),
            "last": hist.index.max().strftime("%Y-%m-%dT%H:%M"),
        },
        mode=llm.mode,
        llm_model=settings.llm_model if llm.mode == "live" else None,
        weather_sources=["best_match_ws100", *weather.ensemble_for_lead(1).columns],
        model_ready=warm["state"] == "ready",
        saved_forecasts=_saved_dates(),
    )


def _backtest_from_store() -> Backtest:
    """28 выпусков февраля — официальный прогон: последние версии с execution_mode = deterministic (то же, что в CSV).
    LIVE-прогнозы диспетчера календарь не подменяют, они доступны через GET /api/forecast/{date}."""
    days, final, created = [], [], []
    for d in pd.date_range(pipeline.FIRST_ISSUE, pipeline.LAST_ISSUE, freq="1D"):
        stored = _latest(d.strftime("%Y-%m-%d"), OFFICIAL_MODE)
        if stored is None:
            continue
        f, hours = stored["forecast"], stored["forecast"]["hours"]
        days.append(
            {
                "issue_date": f["issue_date"],
                "energy_d1": f["summary"]["energy_d1"],
                "energy_d2": f["summary"]["energy_d2"],
                "low_hours": f["summary"]["low_hours"],
                "flags": f["analysis"]["flags"],
            }
        )
        final += [
            {k: h[k] for k in ("time", "p50", "p10", "p90")} | {"issue_date": f["issue_date"]}
            for h in hours
            if h["lead_day"] == 1
        ]
        created.append(stored["passport"]["created_at"])
    if not days:
        raise HTTPException(status_code=404, detail="Ретроспективный прогон ещё не выполнялся")
    return Backtest(
        runs=len(days),
        file=BACKTEST_FILE if BACKTEST_CSV["all"].is_file() else None,
        final_file="outputs/forecast_feb2026_final.csv",
        generated_at=max(created),
        forecasts=days,
        final_hours=final,
    )


@router.get("/backtest", response_model=Backtest)
def backtest_saved() -> Backtest:
    return _backtest_from_store()


@router.post("/backtest", response_model=Backtest)
def backtest(body: BacktestIn | None = None) -> Backtest:
    """Прогон всего февраля заново (агент, планировщик без LLM) → outputs/forecasts и CSV.
    Частичный период не принимаем: он перезаписал бы CSV неполным набором."""
    body = body or BacktestIn()
    start = _call(pipeline.check_issue_date, body.start)
    end = _call(pipeline.check_issue_date, body.end)
    if (start, end) != (pipeline.FIRST_ISSUE, pipeline.LAST_ISSUE):
        raise HTTPException(status_code=400, detail="Прогон — только за весь тестовый период 2026-01-31…2026-02-27")
    if not _backtest_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Прогон уже идёт")
    try:
        if warm["state"] == "warming":
            _warm_done.wait(WARM_TIMEOUT_S)
        _call(cli.backtest, body.start, body.end)
    finally:
        _backtest_lock.release()
    return _backtest_from_store()


@router.get("/backtest/csv")
def backtest_csv(kind: str = Query("all")) -> FileResponse:
    if kind not in BACKTEST_CSV:
        raise HTTPException(status_code=400, detail="kind: all (28 выпусков × 48 ч) или final (каждый час февраля)")
    path = BACKTEST_CSV[kind]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Ретроспективный прогон ещё не выполнялся")
    return FileResponse(path, media_type="text/csv", filename=path.name)


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


def build_holdout() -> pd.DataFrame:
    """Январь 2026: прогноз модели, обученной только до 31.12.2025, с тем же калиброванным интервалом, что у агента,
    кривая мощности и факт — по часам для обоих горизонтов. Считается один раз (~1 мин) и сохраняется в CSV."""
    p = calibrate._month_predictions("2026-01")
    p10, p90 = calibrate.apply(p["p10"], p["p90"], p["ws"], calibrate.load()["widen_by_regime"])
    out = pd.DataFrame(
        {
            "time": p.index.strftime("%Y-%m-%dT%H:%M"),
            "lead_day": p["lead"].astype(int).to_numpy(),
            "p50": p["p50"].round(4).to_numpy(),
            "p10": pd.Series(p10).round(4).to_numpy(),
            "p90": pd.Series(p90).round(4).to_numpy(),
            "curve": p["curve"].round(4).to_numpy(),
            "actual": p["y"].round(4).to_numpy(),
        }
    ).sort_values(["lead_day", "time"])
    OUTPUTS.mkdir(exist_ok=True)
    out.to_csv(HOLDOUT_FILE, index=False)
    HOLDOUT_META.write_text(json.dumps({"calibration_id": _calibration_id()}, ensure_ascii=False), encoding="utf-8")
    return out


def _calibration_id() -> str:
    """Хеш outputs/calibration.json: меняется при каждой пересборке калибровки (граница обучения, модель)."""
    return passport._hash(calibrate.load())[:12]


def _holdout_fresh() -> bool:
    if not (HOLDOUT_FILE.is_file() and HOLDOUT_META.is_file()):
        return False
    return json.loads(HOLDOUT_META.read_text(encoding="utf-8")).get("calibration_id") == _calibration_id()


def _holdout_table() -> pd.DataFrame:
    with _holdout_lock:
        if not _holdout_fresh():
            build_holdout()
        return pd.read_csv(HOLDOUT_FILE)


@router.get("/holdout", response_model=Holdout)
def holdout(issue_date: str = Query("2026-01-20")) -> Holdout:
    """«Ожидалось / реально» на отложенном январе: выпуск D → сутки D+1 (горизонт 1) и D+2 (горизонт 2)."""
    if not DATE_RE.match(issue_date):
        raise HTTPException(status_code=400, detail="issue_date в формате YYYY-MM-DD")
    d = _day(issue_date, "issue_date")
    if not HOLDOUT_ISSUES[0].date() <= d <= HOLDOUT_ISSUES[1].date():
        raise HTTPException(status_code=400, detail="Отложенная выборка — выпуски с 2026-01-01 по 2026-01-29")
    t = _holdout_table()
    day = {1: (d + timedelta(days=1)).isoformat(), 2: (d + timedelta(days=2)).isoformat()}
    rows = t[t.apply(lambda r: r["time"][:10] == day[int(r["lead_day"])], axis=1)].sort_values("time")
    if rows.empty:
        raise HTTPException(status_code=404, detail="Для этой даты нет часов с прогнозом и фактом")
    hours = [{k: (None if pd.isna(v) else v) for k, v in r.items()} for r in rows.to_dict("records")]
    ok = rows["actual"].notna()
    return Holdout(
        issue_date=issue_date,
        hours=hours,
        mae={
            "model": round(float((rows.loc[ok, "p50"] - rows.loc[ok, "actual"]).abs().mean()), 4) if ok.any() else None,
            "curve": round(float((rows.loc[ok, "curve"] - rows.loc[ok, "actual"]).abs().mean()), 4)
            if ok.any()
            else None,
        },
    )


# ---------- автономный прогон агента «как в прошлом» (ТЗ, п. 4 и ретроспектива) ----------
_auto = {"status": "idle", "done": 0, "total": 0, "events": [], "error": None, "started_at": None}
_auto_lock = threading.Lock()


def _auto_worker(start: str, end: str, use_llm: bool) -> None:
    try:
        for d in pd.date_range(start, end, freq="1D"):
            day = d.strftime("%Y-%m-%d")
            res = agent.autonomous_run(day, day, use_llm=use_llm)
            _auto["events"].extend(res["events"])
            _auto["done"] += 1
        _auto["status"] = "done"
    except Exception as exc:  # не роняем сервер; причина видна в GET
        log.exception("autonomous run failed")
        _auto["status"], _auto["error"] = "error", f"{type(exc).__name__}: {exc}"[:300]
    finally:
        _auto_lock.release()


@router.post("/autonomous-run")
def start_autonomous_run(body: dict | None = None) -> dict:
    """Запустить в фоне автономный прогон агента по дням выпуска (по умолчанию 31.01–27.02). Прогресс — GET."""
    body = body or {}
    start, end = body.get("start", "2026-01-31"), body.get("end", "2026-02-27")
    try:
        pipeline.check_issue_date(start)
        pipeline.check_issue_date(end)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not _auto_lock.acquire(blocking=False):
        raise HTTPException(409, "Автономный прогон уже идёт")
    use_llm = bool(body.get("use_llm", False)) and LLMClient().mode == "live"
    _auto.update(status="running", done=0, total=len(pd.date_range(start, end, freq="1D")), events=[], error=None,
                 started_at=datetime.now().isoformat(timespec="seconds"), use_llm=use_llm)
    threading.Thread(target=_auto_worker, args=(start, end, use_llm), daemon=True).start()
    return {k: _auto[k] for k in ("status", "done", "total", "started_at")}


@router.get("/autonomous-run")
def autonomous_run_status() -> dict:
    return dict(_auto)
