"""Архивные прогнозы погоды из открытого источника: Open-Meteo Previous Runs API (CC BY 4.0, без ключа).

`<var>_previous_dayN` — значение на час h из выпуска модели примерно за N·24 ч до h (N = 1, 2, 3).
Выпуск модели публикуется не сразу: учитываем задержку публикации PUBLISH_DELAY_H. Для каждого часа прогноза берётся
самый свежий выпуск, опубликованный не позже момента прогноза (правило — model.run_lead). Фактическую погоду не используем.
Ответ сохраняется в data/weather/, чтобы проект работал без интернета; `refresh=True` скачивает заново.
"""

import json
from functools import lru_cache

import httpx
import numpy as np
import pandas as pd

from app.config import ROOT_DIR
from app.forecast.data import STATION

URL = "https://previous-runs-api.open-meteo.com/v1/forecast"
SOURCE = "Open-Meteo Previous Runs API (best_match)"
VARS = ["wind_speed_10m", "wind_speed_100m", "wind_direction_100m", "wind_gusts_10m", "temperature_2m"]
CACHE = ROOT_DIR / "data" / "weather" / "previous_runs.json"
START, END = "2024-01-01", "2026-03-02"
DAYS = (1, 2, 3)
PUBLISH_DELAY_H = 7
ONLINE = __import__("os").getenv("WEATHER_ONLINE", "1") != "0"  # 0 — только локальный архив  # выпуск NWP-модели доступен примерно через 4–7 ч после срока; берём консервативно 7 ч
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
        "hourly": ",".join(f"{v}_previous_day{d}" for v in variables for d in DAYS),
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


def _source_vars(model: str | None) -> list[str]:
    return VARS if model is None else ENSEMBLE[model]


def fetch_window(start: str, end: str, timeout: float = 8.0) -> dict:
    """Агент САМ получает архивные прогнозы по координатам станции на окно выпуска (7 источников, выпуски за 1–3 суток).
    Полученные значения подставляются в рабочие таблицы погоды — модель считает по ним. Нет сети или источник не ответил —
    для этого источника остаётся локальный архив data/weather/ (с пометкой). Возвращает снимок: откуда данные, хеш
    сырых ответов и совпадение с архивом (прошлые выпуски NWP не меняются — расхождение означает обновление входа)."""
    import hashlib

    report = {"window": [start, end], "sources": [], "network_ok": 0, "archive_fallback": 0}
    digest = hashlib.sha256()
    for m in [None, *ENSEMBLE]:
        name = m or "best_match"
        variables = _source_vars(m)
        params = {
            "latitude": STATION[0], "longitude": STATION[1],
            "hourly": ",".join(f"{v}_previous_day{d}" for v in variables for d in DAYS),
            "start_date": start, "end_date": end, "timezone": "Asia/Almaty", "wind_speed_unit": "ms",
        }
        if m is not None:
            params["models"] = m
        try:
            resp = httpx.get(URL, params=params, timeout=timeout)
            resp.raise_for_status()
            raw = resp.json()["hourly"]
        except Exception as exc:  # сеть, лимиты, таймаут — не роняем агента
            report["archive_fallback"] += 1
            report["sources"].append({"source": name, "origin": "archive", "reason": type(exc).__name__})
            continue
        fresh = pd.DataFrame(raw)
        fresh["time"] = pd.to_datetime(fresh["time"])
        fresh = fresh.set_index("time")
        table = load() if m is None else load_model(m)
        cols = list(fresh.columns)
        target = [c.replace("_previous_day", "_d") for c in cols] if m is None else cols
        old = table.reindex(fresh.index)[target].to_numpy(dtype=float)
        new = fresh[cols].to_numpy(dtype=float)
        diff = float(np.nanmax(np.abs(old - new))) if np.isfinite(old - new).any() else 0.0
        table.loc[fresh.index, target] = new  # модель дальше считает по полученным сейчас данным
        digest.update(json.dumps(raw, sort_keys=True).encode())
        report["network_ok"] += 1
        report["sources"].append({"source": name, "origin": "network", "hours": len(fresh),
                                  "max_abs_diff_vs_archive": round(diff, 3), "updated": bool(diff > 1e-6)})
    report["snapshot_hash"] = digest.hexdigest()[:16] if report["network_ok"] else None
    report["origin"] = ("network" if report["archive_fallback"] == 0 else
                        "mixed" if report["network_ok"] else "archive")
    report["input_updated"] = any(s.get("updated") for s in report["sources"])
    return report
