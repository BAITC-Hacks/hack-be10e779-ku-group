"""Новые станции: история по месяцам → автоматический пересчёт модели станции → прогноз на 48 ч.

Для станции из ТЗ работает полная модель (бустинг, 7 источников архивной погоды, калибровка) — её этот модуль не трогает.
Для добавленных станций — упрощённая, но честная модель, которую можно пересчитать сразу после загрузки:
  1) каждый загруженный месяц дописывается к истории турбины (повторы по времени заменяются);
  2) по всей истории станции строится эмпирическая кривая мощности: ветер (бины 0,5 м/с) → p10/p50/p90 мощности;
  3) прогноз на 48 ч: текущий прогноз ветра Open-Meteo по координатам станции (100 м) → кривая.
"""

import io
import json
from datetime import datetime, timedelta

import httpx
import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.stations import MAX_BYTES, UPLOADS
from app.auth import require
from app.config import ROOT_DIR
from app.db import get_db
from app.forecast import data
from app.models import Station, Turbine

router = APIRouter(tags=["stations"])

BIN = 0.5  # м/с
MIN_BIN_HOURS = 3  # бин с меньшим числом часов не используется
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


def _read_month(raw: bytes) -> pd.DataFrame:
    try:
        df = pd.read_csv(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(400, "Не удалось прочитать CSV") from exc
    missing = [c for c in data.COLS if c not in df.columns]
    if missing:
        raise HTTPException(400, f"Нет столбцов: {', '.join(missing)}")
    df = df.rename(columns=data.COLS)[list(data.COLS.values())]
    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    df = df.dropna(subset=["time"])
    if df.empty:
        raise HTTPException(400, "В файле нет строк с корректным временем")
    return df


def _turbine_file(t: Turbine):
    return UPLOADS / f"turbine_{t.id}.csv"


def _curve_file(station_id: int):
    return UPLOADS / f"station_{station_id}_curve.json"


def _station_hourly(st: Station) -> pd.DataFrame:
    """Почасовая история станции: среднее по турбинам (как в data.py для станции кейса)."""
    frames = []
    for t in st.turbines:
        f = _turbine_file(t)
        if not f.is_file():
            continue
        df = pd.read_csv(f, parse_dates=["time"]).set_index("time").sort_index()
        h = df[["wind", "power"]].resample("1h").mean()
        frames.append(h)
    if not frames:
        return pd.DataFrame(columns=["wind", "power"])
    allh = pd.concat(frames, axis=1, keys=range(len(frames)))
    out = pd.DataFrame(
        {
            "wind": allh.xs("wind", axis=1, level=1).mean(axis=1),
            "power": allh.xs("power", axis=1, level=1).mean(axis=1),
        }
    ).dropna()
    return out[(out["power"] >= 0) & (out["power"] <= 1) & (out["wind"] >= 0)]


def refit(st: Station) -> dict | None:
    """Пересчитать кривую мощности станции по всей загруженной истории. Возвращает кривую или None (истории нет)."""
    h = _station_hourly(st)
    if len(h) < 24:
        return None
    b = (h["wind"] / BIN).round() * BIN
    g = h.groupby(b)["power"]
    stat = pd.DataFrame({"n": g.size(), "p10": g.quantile(0.1), "p50": g.median(), "p90": g.quantile(0.9)})
    stat = stat[stat["n"] >= MIN_BIN_HOURS].sort_index()
    if stat.empty:
        return None
    # кривая не убывает до номинала: сглаживаем накопленным максимумом медианы
    stat["p50"] = stat["p50"].cummax().clip(0, 1)
    points = [
        {
            "wind": float(w),
            "p10": round(float(r.p10), 4),
            "p50": round(float(r.p50), 4),
            "p90": round(float(r.p90), 4),
            "n": int(r.n),
        }
        for w, r in stat.iterrows()
    ]
    curve = {
        "station_id": st.id,
        "hours": int(len(h)),
        "period": [str(h.index.min()), str(h.index.max())],
        "points": points,
        "fitted_at": datetime.now().isoformat(timespec="seconds"),
    }
    UPLOADS.mkdir(parents=True, exist_ok=True)
    _curve_file(st.id).write_text(json.dumps(curve, ensure_ascii=False), encoding="utf-8")
    st.model_status = (
        f"модель пересчитана: кривая мощности по {len(h)} ч истории ({h.index.min():%d.%m.%Y}–{h.index.max():%d.%m.%Y})"
    )
    return curve


@router.post("/turbines/{turbine_id}/history/months")
async def upload_months(
    turbine_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    _: dict = Depends(require("admin")),
) -> dict:
    """Загрузить один или несколько CSV (по месяцу в файле). Месяцы дописываются к истории турбины, модель станции
    пересчитывается автоматически."""
    t = db.get(Turbine, turbine_id)
    if t is None:
        raise HTTPException(404, "Турбина не найдена")
    st = db.get(Station, t.station_id)
    if st.is_case:
        raise HTTPException(400, "История станции из ТЗ фиксирована")
    parts, report = [], []
    for f in files:
        raw = await f.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise HTTPException(413, f"{f.filename}: файл больше 30 МБ")
        df = _read_month(raw)
        parts.append(df)
        report.append(
            {"name": f.filename, "rows": int(len(df)), "period": [str(df["time"].min()), str(df["time"].max())]}
        )
    path = _turbine_file(t)
    if path.is_file():
        parts.insert(0, pd.read_csv(path, parse_dates=["time"]))
    hist = pd.concat(parts).drop_duplicates("time", keep="last").sort_values("time")
    UPLOADS.mkdir(parents=True, exist_ok=True)
    hist.to_csv(path, index=False)
    t.history_rows, t.history_start, t.history_end = int(len(hist)), str(hist["time"].min()), str(hist["time"].max())
    t.history_file = str(path.relative_to(ROOT_DIR)) if path.is_relative_to(ROOT_DIR) else path.name
    db.flush()
    db.refresh(st)
    curve = refit(st)
    if curve is None:
        st.model_status = "история загружена, но её мало для модели (нужно ≥ 24 полных часа)"
    db.commit()
    return {
        "turbine_id": t.id,
        "files": report,
        "total_rows": t.history_rows,
        "period": [t.history_start, t.history_end],
        "station_status": st.model_status,
        "curve": {"hours": curve["hours"], "bins": len(curve["points"])} if curve else None,
    }


@router.get("/stations/{station_id}/curve")
def station_curve(station_id: int) -> dict:
    f = _curve_file(station_id)
    if not f.is_file():
        raise HTTPException(404, "Модель станции ещё не построена — загрузите историю турбин")
    return json.loads(f.read_text(encoding="utf-8"))


@router.post("/stations/{station_id}/forecast")
def station_forecast(station_id: int, db: Session = Depends(get_db), _: dict = Depends(require("dispatcher"))) -> dict:
    st = db.get(Station, station_id)
    if st is None:
        raise HTTPException(404, "Станция не найдена")
    f = _curve_file(station_id)
    if st.is_case or not f.is_file():
        raise HTTPException(
            409,
            "Загрузите историю турбин — модель станции ещё не построена"
            if not st.is_case
            else "Для станции из ТЗ — вкладка «Прогноз» (полная модель)",
        )
    curve = json.loads(f.read_text(encoding="utf-8"))
    pts = curve["points"]
    xs = np.array([p["wind"] for p in pts])
    try:
        r = httpx.get(
            FORECAST_URL,
            params={
                "latitude": st.latitude,
                "longitude": st.longitude,
                "hourly": "wind_speed_100m",
                "wind_speed_unit": "ms",
                "timezone": "Asia/Almaty",
                "forecast_days": 3,
            },
            timeout=20,
        )
        r.raise_for_status()
        w = r.json()["hourly"]
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise HTTPException(503, "Нет доступа к прогнозу погоды Open-Meteo — попробуйте позже") from exc
    now = datetime.now()
    d1 = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    d2 = (now + timedelta(days=2)).strftime("%Y-%m-%d")
    hours = []
    for t, ws in zip(w["time"], w["wind_speed_100m"], strict=False):
        if t[:10] not in (d1, d2) or ws is None:
            continue
        q = {k: float(np.interp(ws, xs, [p[k] for p in pts])) for k in ("p10", "p50", "p90")}
        hours.append({"time": t, "wind_100m": round(float(ws), 2), **{k: round(v, 4) for k, v in q.items()}})
    if not hours:
        raise HTTPException(503, "Прогноз погоды пришёл без нужных часов")
    e1 = sum(h["p50"] for h in hours if h["time"][:10] == d1)
    e2 = sum(h["p50"] for h in hours if h["time"][:10] == d2)
    peak = max(hours, key=lambda h: h["p50"])["time"]
    return {
        "station_id": st.id,
        "issued_at": now.isoformat(timespec="minutes"),
        "weather_source": "Open-Meteo Forecast API (ветер 100 м) по координатам станции",
        "model": f"кривая мощности по {curve['hours']} ч загруженной истории",
        "note": "Упрощённая модель для новой станции. Полная модель (бустинг, 7 источников архивной погоды, "
        "калибровка) — для станции из ТЗ.",
        "hours": hours,
        "summary": {"energy_d1": round(e1, 2), "energy_d2": round(e2, 2), "peak_hour": peak},
    }
