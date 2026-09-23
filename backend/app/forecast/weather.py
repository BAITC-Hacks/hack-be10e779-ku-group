"""Архивные прогнозы погоды из открытого источника: Open-Meteo Previous Runs API (CC BY 4.0, без ключа).

`<var>_previous_day1` — значение на час h из выпуска модели примерно за 24 ч до h; `_previous_day2` — за 48 ч.
Прогноз делается в конце дня D (см. CASE.md, A4): для суток D+1 берём day1, для D+2 — day2 — оба выпуска сделаны
не позже конца дня D, то есть были доступны на момент прогноза. Фактическую погоду не используем нигде.
Ответ сохраняется в data/weather/, чтобы проект работал без интернета; `refresh=True` скачивает заново.
"""

import json
from functools import lru_cache

import httpx
import pandas as pd

from app.config import ROOT_DIR
from app.forecast.data import STATION

URL = "https://previous-runs-api.open-meteo.com/v1/forecast"
SOURCE = "Open-Meteo Previous Runs API (best_match)"
VARS = ["wind_speed_10m", "wind_speed_100m", "wind_direction_100m", "wind_gusts_10m", "temperature_2m"]
CACHE = ROOT_DIR / "data" / "weather" / "previous_runs.json"
START, END = "2024-01-01", "2026-03-02"
# Отдельные модели погоды — ансамбль (проверено 23.09.2026: архив выпусков за 1–2 суток есть для точки станции).
# У JMA, CMA и GEM в архиве только ветер на 10 м.
FULL = ["wind_speed_100m", "wind_speed_10m", "wind_direction_100m", "wind_gusts_10m", "temperature_2m"]
ENSEMBLE = {
    "ecmwf_ifs025": FULL,
    "icon_global": FULL,
    "gfs_seamless": FULL,
    "jma_seamless": ["wind_speed_10m"],
    "cma_grapes_global": ["wind_speed_10m"],
    "gem_seamless": ["wind_speed_10m"],
}


def _cache_path(model: str | None):
    return CACHE if model is None else CACHE.with_name(f"prev_{model}.json")


def fetch(refresh: bool = False, model: str | None = None) -> dict:
    """Сырой ответ API по координатам станции за весь период одним запросом (~1 МБ).
    `model=None` — best_match (Open-Meteo сам выбирает модель), иначе конкретная модель из ENSEMBLE."""
    path = _cache_path(model)
    if path.exists() and not refresh:
        return json.loads(path.read_text(encoding="utf-8"))
    variables = VARS if model is None else ENSEMBLE[model]
    params = {
        "latitude": STATION[0],
        "longitude": STATION[1],
        "hourly": ",".join(f"{v}_previous_day{d}" for v in variables for d in (1, 2)),
        "start_date": START,
        "end_date": END,
        "timezone": "Asia/Almaty",
        "wind_speed_unit": "ms",
    }
    if model is not None:
        params["models"] = model
    resp = httpx.get(URL, params=params, timeout=120)
    resp.raise_for_status()
    data = resp.json()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")
    load.cache_clear()
    load_model.cache_clear()
    return data


def fetch_all(refresh: bool = False) -> list[str]:
    fetch(refresh)
    for m in ENSEMBLE:
        fetch(refresh, m)
    return ["best_match", *ENSEMBLE]


@lru_cache(maxsize=1)
def load() -> pd.DataFrame:
    """Почасовая таблица: <var>_d1, <var>_d2 для каждой переменной."""
    raw = fetch()["hourly"]
    df = pd.DataFrame(raw)
    df["time"] = pd.to_datetime(df["time"])
    df = df.set_index("time")
    df.columns = [c.replace("_previous_day", "_d") for c in df.columns]
    return df


@lru_cache(maxsize=len(ENSEMBLE))
def load_model(model: str) -> pd.DataFrame:
    df = pd.DataFrame(fetch(model=model)["hourly"])
    df["time"] = pd.to_datetime(df["time"])
    return df.set_index("time")


def ensemble_for_lead(lead: int) -> pd.DataFrame:
    """Ветер отдельных моделей за `lead` суток до часа: колонки <модель>_ws100, <модель>_ws10."""
    out = {}
    for m, variables in ENSEMBLE.items():
        df = load_model(m)
        short = m.split("_")[0]
        for v, tag in (("wind_speed_100m", "ws100"), ("wind_speed_10m", "ws10")):
            if v in variables:
                out[f"{short}_{tag}"] = df[f"{v}_previous_day{lead}"]
    return pd.DataFrame(out)


def for_lead(lead: int) -> pd.DataFrame:
    """Погода, известная за `lead` суток до часа: колонки без суффикса (wind_speed_100m, …)."""
    df = load()
    cols = [f"{v}_d{lead}" for v in VARS]
    return df[cols].rename(columns=dict(zip(cols, VARS, strict=True)))
