"""Эксперимент 23.09 ~15:50: пространственные признаки — архивные прогнозы (те же выпуски, что у часа станции)
в 8 точках вокруг (±0.25° и ±0.5°): ветер 100 м и направление, градиенты давления С–Ю и З–В, разность температуры
гора (юг, 1451 м) − станция (555 м) как признак стабильности и горно-долинной циркуляции. Честно по времени:
для каждого часа берётся тот же lead (выпуск), что и для точки станции. Оценка — как в lagged_exp.py."""

import json

import numpy as np
import pandas as pd

from app.config import ROOT_DIR
from app.forecast import data, model

MONTHS = ["2025-10", "2025-11", "2025-12", "2026-01"]
H = data.load_hourly()
PTS = ["n25", "s25", "e25", "w25", "n50", "s50", "e50", "w50"]
RAW = {}
for p in PTS:
    d = pd.DataFrame(json.load(open(ROOT_DIR / "data" / "weather" / "spatial" / f"{p}.json"))["hourly"])
    d["time"] = pd.to_datetime(d["time"])
    RAW[p] = d.set_index("time")


def spatial(index: pd.DatetimeIndex, lead: int) -> pd.DataFrame:
    x = pd.DataFrame(index=index)
    for p in PTS:
        d = RAW[p].reindex(index)
        x[f"{p}_ws"] = d[f"wind_speed_100m_previous_day{lead}"]
        rad = np.deg2rad(d[f"wind_direction_100m_previous_day{lead}"])
        x[f"{p}_u"] = -x[f"{p}_ws"] * np.sin(rad)
        x[f"{p}_v"] = -x[f"{p}_ws"] * np.cos(rad)
        x[f"{p}_t"] = d[f"temperature_2m_previous_day{lead}"]
        x[f"{p}_p"] = d[f"surface_pressure_previous_day{lead}"]
    x["dp_ns25"] = x["n25_p"] - x["s25_p"]
    x["dp_ew25"] = x["e25_p"] - x["w25_p"]
    x["dp_ns50"] = x["n50_p"] - x["s50_p"]
    x["dp_ew50"] = x["e50_p"] - x["w50_p"]
    x["ws_ring_mean"] = x[[f"{p}_ws" for p in PTS]].mean(axis=1)
    x["ws_ring_std"] = x[[f"{p}_ws" for p in PTS]].std(axis=1)
    return x


def spatial_at(index, leads):
    parts = [spatial(index[leads.to_numpy() == n], n) for n in sorted(set(leads))]
    return pd.concat(parts).reindex(index)


SP = None


def full(index, leads):
    global SP
    x = model.features_at(index, leads).join(spatial_at(index, leads))
    x["dt_mountain"] = x["s25_t"] - x["temp"]  # гора − станция: инверсия/стабильность
    if SP is None:
        SP = [c for c in x.columns if c not in model.FEATURES]
    return x


def table(end):
    hist = H.loc[:end]
    parts = [full(hist.index, pd.Series(n, index=hist.index)).join(hist[["power"]]) for n in (1, 2, 3)]
    return pd.concat(parts).dropna(subset=["ws100", "power"])


def gbr():
    return model.HistGradientBoostingRegressor(loss="quantile", quantile=0.5, max_iter=200, learning_rate=0.08,
                                               max_leaf_nodes=31, min_samples_leaf=40, l2_regularization=1.0,
                                               random_state=0)


SUBSETS = {
    "градиенты+гора": ["dp_ns25", "dp_ew25", "dp_ns50", "dp_ew50", "dt_mountain"],
    "кольцо ветра": ["ws_ring_mean", "ws_ring_std"] + [f"{p}_ws" for p in PTS],
}
rows = []
for mon in MONTHS:
    start = pd.Timestamp(mon + "-01")
    end = start + pd.offsets.MonthEnd(0) + pd.Timedelta(hours=23)
    t = table(start - pd.Timedelta(days=1, hours=1))
    variants = {"база": model.FEATURES, **{k: model.FEATURES + v for k, v in SUBSETS.items()},
                "всё": model.FEATURES + SP}
    fitted = {k: gbr().fit(t[v], t["power"]) for k, v in variants.items()}
    hist = H.loc[start:end]
    for lead in (1, 2):
        x = full(hist.index, model.horizon_leads(hist.index, lead))
        ok = x["ws100"].notna() & hist["power"].notna()
        y = hist.loc[ok, "power"]
        r = {"month": mon, "lead": lead}
        for k, v in variants.items():
            r[k] = np.abs(np.clip(fitted[k].predict(x.loc[ok, v]), 0, 1) - y).mean()
        rows.append(r)
    print(rows[-2:], flush=True)
df = pd.DataFrame(rows).round(4)
print(df.to_string(index=False))
m = df.groupby("month")[[c for c in df.columns if c not in ("month", "lead")]].mean()
for k in m.columns:
    if k != "база":
        print(k, "mean", round(m[k].mean(), 4), "vs база", round(m["база"].mean(), 4), "| months ≥0.002 better:",
              int(((m["база"] - m[k]) >= 0.002).sum()), "of 4")
