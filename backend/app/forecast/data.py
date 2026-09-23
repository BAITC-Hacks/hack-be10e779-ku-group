"""Исторические данные турбин (10 минут) → почасовая таблица станции. Время — местное (UTC+5), см. CASE.md, A1."""

from functools import lru_cache
from pathlib import Path

import pandas as pd

from app.config import ROOT_DIR

RAW_DIR = ROOT_DIR / "data" / "raw"
COLS = {
    "Статистическое время": "time",
    "Средняя скорость ветра(m/s)": "wind",
    "Нормализованная активная мощность": "power",
    "Средняя температура окружающей среды(°C)": "temp",
}
# координаты из ТЗ; погода берётся для средней точки (турбины в 400 м, одна ячейка сетки модели погоды)
TURBINES = {"t1": (43.645150, 78.535604), "t2": (43.643198, 78.538828)}
STATION = (43.6442, 78.5372)


def _load_turbine(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path).rename(columns=COLS)[list(COLS.values())]
    df["time"] = pd.to_datetime(df["time"])
    df = df.set_index("time").sort_index()
    # часовое значение — среднее шести 10-минутных; неполные часы не используем (CASE.md, A3)
    hourly = df.resample("1h").agg(["mean", "count"])
    out = pd.DataFrame(
        {name: hourly[(name, "mean")] for name in ("wind", "power", "temp")},
        index=hourly.index,
    )
    out[hourly[("power", "count")] < 6] = float("nan")
    return out


@lru_cache(maxsize=1)
def load_hourly() -> pd.DataFrame:
    """Почасово: t1_power, t2_power, power (среднее по станции), t1_wind, t2_wind, wind, temp."""
    t1 = _load_turbine(RAW_DIR / "turbine1.csv").add_prefix("t1_")
    t2 = _load_turbine(RAW_DIR / "turbine2.csv").add_prefix("t2_")
    df = t1.join(t2, how="outer")
    df["power"] = df[["t1_power", "t2_power"]].mean(axis=1, skipna=False)
    df["wind"] = df[["t1_wind", "t2_wind"]].mean(axis=1)
    df["temp"] = df[["t1_temp", "t2_temp"]].mean(axis=1)
    df.index.name = "time"
    return df
