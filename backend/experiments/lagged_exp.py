"""Эксперимент 23.09 ~15:40: lagged ensemble — для часа с выпуском за N суток добавить значения того же часа из более
старых выпусков (N+1, N+2, в пределах 3 суток), их среднее и разброс. Все эти выпуски опубликованы ещё раньше —
честно по времени. Оценка — как model.holdout_metrics (окт–янв, граница S − 1 сут − 1 ч, horizon_leads)."""

import numpy as np
import pandas as pd

from app.forecast import data, model

MONTHS = ["2025-10", "2025-11", "2025-12", "2026-01"]
H = data.load_hourly()
LAG_COLS = ["ws100", "ecmwf_ws100", "icon_ws100", "gfs_ws100"]


def lagged(index: pd.DatetimeIndex, leads: pd.Series) -> pd.DataFrame:
    """Для каждого часа: значения из выпусков lead+1 и lead+2 (если ≤ 3), плюс разброс по выпускам."""
    base = model.features_at(index, leads)
    older = {}
    for extra in (1, 2):
        cols = {}
        for n in (1, 2, 3):
            m = n + extra
            if m > 3:
                continue
            f = model.features(index[leads.to_numpy() == n], m)[LAG_COLS]
            cols[n] = f
        parts = [c for c in cols.values()]
        older[extra] = pd.concat(parts).reindex(index) if parts else pd.DataFrame(index=index, columns=LAG_COLS)
    x = base.copy()
    for c in LAG_COLS:
        x[f"{c}_lag1"] = older[1][c]
        x[f"{c}_lag2"] = older[2][c]
        stack = pd.concat([base[c], older[1][c], older[2][c]], axis=1)
        x[f"{c}_lagstd"] = stack.std(axis=1)
        x[f"{c}_lagdiff"] = base[c] - older[1][c]
    return x


def table(end: pd.Timestamp) -> pd.DataFrame:
    hist = H.loc[:end]
    parts = []
    for n in (1, 2, 3):
        leads = pd.Series(n, index=hist.index)
        parts.append(lagged(hist.index, leads).join(hist[["power"]]))
    return pd.concat(parts).dropna(subset=["ws100", "power"])


def gbr():
    return model.HistGradientBoostingRegressor(loss="quantile", quantile=0.5, max_iter=200, learning_rate=0.08,
                                               max_leaf_nodes=31, min_samples_leaf=40, l2_regularization=1.0,
                                               random_state=0)


EXTRA = [f"{c}_{s}" for c in LAG_COLS for s in ("lag1", "lag2", "lagstd", "lagdiff")]
rows = []
for mon in MONTHS:
    start = pd.Timestamp(mon + "-01")
    end = start + pd.offsets.MonthEnd(0) + pd.Timedelta(hours=23)
    until = start - pd.Timedelta(days=1, hours=1)
    t = table(until)
    base_m = gbr().fit(t[model.FEATURES], t["power"])
    lag_m = gbr().fit(t[model.FEATURES + EXTRA], t["power"])
    hist = H.loc[start:end]
    for lead in (1, 2):
        leads = model.horizon_leads(hist.index, lead)
        x = lagged(hist.index, leads)
        ok = x["ws100"].notna() & hist["power"].notna()
        y = hist.loc[ok, "power"]
        pb = np.clip(base_m.predict(x.loc[ok, model.FEATURES]), 0, 1)
        pl = np.clip(lag_m.predict(x.loc[ok, model.FEATURES + EXTRA]), 0, 1)
        rows.append({"month": mon, "lead": lead, "base": np.abs(pb - y).mean(), "lagged": np.abs(pl - y).mean()})
    print(rows[-2:], flush=True)
df = pd.DataFrame(rows)
df["gain"] = df["base"] - df["lagged"]
print(df.round(4).to_string(index=False))
print("mean:", df[["base", "lagged"]].mean().round(4).to_dict(), "| months better (both leads avg):",
      int((df.groupby("month")["gain"].mean() > 0.002).sum()), "of 4")
