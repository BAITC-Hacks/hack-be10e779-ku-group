"""Модель выработки: градиентный бустинг по архивному прогнозу погоды + базовые методы для сравнения.

Обучается на парах «прогноз погоды, выпущенный за 1–2 суток до часа» → «фактическая мощность в этот час».
Так модель учится и связи ветер→мощность, и систематическим ошибкам прогноза погоды именно для этой площадки.
Все признаки известны на момент прогноза: погода из архивных выпусков, календарь, горизонт (lead).
"""

from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from app.forecast import data, weather

ENS100 = ["ecmwf_ws100", "icon_ws100", "gfs_ws100"]
ENS10 = ["ecmwf_ws10", "icon_ws10", "gfs_ws10", "jma_ws10", "cma_ws10", "gem_ws10"]
FEATURES = [
    "lead", "ws100", "ws10", "ws100_cube", "shear", "gust", "dir_sin", "dir_cos", "temp",
    "hour_sin", "hour_cos", "doy_sin", "doy_cos",
    *ENS100, *ENS10, "ens_ws100_mean", "ens_ws100_std", "ens_ws10_mean", "ens_ws10_std",
]
QUANTILES = {"p10": 0.1, "p50": 0.5, "p90": 0.9}
TRAIN_END = pd.Timestamp("2026-01-31 23:00")  # последний час истории из ТЗ
HOLDOUT = (pd.Timestamp("2026-01-01 00:00"), TRAIN_END)  # январь 2026 — честная отложенная выборка


def features(index: pd.DatetimeIndex, lead: int) -> pd.DataFrame:
    """Признаки на часы `index` из погоды, известной за `lead` суток. Пропуски погоды остаются NaN."""
    w = weather.for_lead(lead).reindex(index)
    ws100 = w["wind_speed_100m"].clip(lower=0)
    ws10 = w["wind_speed_10m"].clip(lower=0)
    rad = np.deg2rad(w["wind_direction_100m"])
    hour = index.hour.to_numpy()
    doy = index.dayofyear.to_numpy()
    ens = weather.ensemble_for_lead(lead).reindex(index)
    x = pd.DataFrame(
        {
            "lead": lead,
            "ws100": ws100,
            "ws10": ws10,
            "ws100_cube": ws100.clip(upper=15) ** 3,
            "shear": ws100 / ws10.where(ws10 > 0.5),
            "gust": w["wind_gusts_10m"],
            "dir_sin": np.sin(rad),
            "dir_cos": np.cos(rad),
            "temp": w["temperature_2m"],
            "hour_sin": np.sin(2 * np.pi * hour / 24),
            "hour_cos": np.cos(2 * np.pi * hour / 24),
            "doy_sin": np.sin(2 * np.pi * doy / 365.25),
            "doy_cos": np.cos(2 * np.pi * doy / 365.25),
        },
        index=index,
    )
    # ансамбль моделей погоды: значения каждой модели, среднее и разброс (разброс — мера неуверенности погоды)
    x = x.join(ens[ENS100 + ENS10])
    x["ens_ws100_mean"] = x[ENS100].mean(axis=1)
    x["ens_ws100_std"] = x[ENS100].std(axis=1)
    x["ens_ws10_mean"] = x[ENS10].mean(axis=1)
    x["ens_ws10_std"] = x[ENS10].std(axis=1)
    return x


def training_table(end: pd.Timestamp) -> pd.DataFrame:
    """Пары (признаки, факт) для обоих горизонтов на часы до `end` включительно, где есть и погода, и факт."""
    hist = data.load_hourly().loc[:end]
    parts = []
    for lead in (1, 2):
        x = features(hist.index, lead)
        parts.append(x.join(hist[["power", "t1_power", "t2_power"]]))
    table = pd.concat(parts)
    return table.dropna(subset=["ws100", "power"])


@dataclass
class Forecaster:
    trained_until: pd.Timestamp
    models: dict = field(default_factory=dict)
    curve: pd.Series | None = None  # базовый метод: эмпирическая кривая мощности
    n_train: int = 0

    def fit(self) -> "Forecaster":
        t = training_table(self.trained_until)
        self.n_train = len(t)
        x = t[FEATURES]
        for name, q in QUANTILES.items():
            self.models[name] = _gbr(q).fit(x, t["power"])
        for turbine in ("t1", "t2"):
            ok = t[f"{turbine}_power"].notna()
            self.models[turbine] = _gbr(0.5).fit(x[ok], t.loc[ok, f"{turbine}_power"])
        self.curve = power_curve(self.trained_until)
        return self

    def predict(self, x: pd.DataFrame) -> pd.DataFrame:
        out = pd.DataFrame(index=x.index)
        for name, model in self.models.items():
            out[name] = np.clip(model.predict(x[FEATURES]), 0, 1)
        # квантили не должны пересекаться
        out["p10"] = np.minimum(out["p10"], out["p50"])
        out["p90"] = np.maximum(out["p90"], out["p50"])
        out["curve"] = apply_curve(self.curve, x["ws100"])
        return out


def _gbr(q: float) -> HistGradientBoostingRegressor:
    return HistGradientBoostingRegressor(
        loss="quantile", quantile=q, max_iter=200, learning_rate=0.08, max_leaf_nodes=31,
        min_samples_leaf=40, l2_regularization=1.0, random_state=0,
    )


def power_curve(end: pd.Timestamp) -> pd.Series:
    """Эмпирическая кривая: медиана мощности станции по бинам измеренного на турбинах ветра (0.5 м/с)."""
    h = data.load_hourly().loc[:end].dropna(subset=["wind", "power"])
    bins = (h["wind"] / 0.5).round() * 0.5
    return h.groupby(bins)["power"].median()


def apply_curve(curve: pd.Series, ws: pd.Series) -> np.ndarray:
    return np.interp(ws.fillna(0).to_numpy(), curve.index.to_numpy(), curve.to_numpy())


@lru_cache(maxsize=2)
def get_forecaster(until: str = str(TRAIN_END)) -> Forecaster:
    """Обучение занимает секунды; модель держится в памяти процесса."""
    return Forecaster(trained_until=pd.Timestamp(until)).fit()


MONTHS = ["2025-10", "2025-11", "2025-12", "2026-01"]


def holdout_metrics() -> dict:
    """Честная проверка скользящим окном: для каждого из 4 последних месяцев модель обучается только на данных ДО него
    и прогнозирует его целиком на горизонтах D+1 и D+2. Один месяц — слишком шумная выборка, поэтому четыре."""
    hourly = data.load_hourly()
    rows, cover = [], {1: [], 2: []}
    agg: dict[tuple, list] = {}
    for mon in MONTHS:
        start = pd.Timestamp(mon + "-01")
        end = start + pd.offsets.MonthEnd(0) + pd.Timedelta(hours=23)
        f = Forecaster(trained_until=start - pd.Timedelta(hours=1))
        t = training_table(f.trained_until)
        f.models = {q: _gbr(v).fit(t[FEATURES], t["power"]) for q, v in QUANTILES.items()}
        f.curve = power_curve(f.trained_until)
        hist = hourly.loc[start:end]
        for lead in (1, 2):
            x = features(hist.index, lead)
            ok = x["ws100"].notna() & hist["power"].notna()
            pred = f.predict(x[ok])
            fact = hist.loc[ok, "power"]
            persist = hourly["power"].shift(24 * lead).reindex(fact.index)
            for name, p in (("Модель (бустинг, ансамбль погоды)", pred["p50"]), ("Кривая мощности", pred["curve"]),
                            ("Персистентность", persist)):
                m = p.notna()
                agg.setdefault((lead, name), []).append(p[m] - fact[m])
                agg.setdefault((lead, name, "fact"), []).append(fact[m])
            cover[lead].append(((fact >= pred["p10"]) & (fact <= pred["p90"])))
    for (lead, name, *rest), errs in agg.items():
        if rest:
            continue
        err = pd.concat(errs)
        fact = pd.concat(agg[(lead, name, "fact")])
        rows.append({
            "lead": f"D+{lead}", "model": name, "hours": int(len(err)),
            "mae": round(float(err.abs().mean()), 4),
            "rmse": round(float(np.sqrt((err ** 2).mean())), 4),
            "nmae": round(float(err.abs().mean() / fact.mean()), 4),
        })
    for lead in (1, 2):
        rows.append({"lead": f"D+{lead}", "model": "Покрытие интервала p10–p90 (цель 0.80)",
                     "coverage": round(float(pd.concat(cover[lead]).mean()), 3)})
    return {"holdout": f"{MONTHS[0]}…{MONTHS[-1]}, скользящее окно", "rows": rows}
