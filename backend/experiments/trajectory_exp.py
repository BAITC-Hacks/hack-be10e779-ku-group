"""Эксперимент B2: траектория ветра одного и того же выпуска вокруг целевого часа.

Для целевого часа t соседние t-3…t+3 всегда вычисляются через ``model.features`` с тем же lead,
что выбран для t. Это важно: ``features_at`` на общем ряду мог бы назначить соседнему часу другой
выпуск погоды и смешать в одном окне разные моменты инициализации NWP.

Оценка повторяет lagged_exp.py: октябрь 2025 — январь 2026, граница обучения
S - 1 сутки - 1 час, честные ``horizon_leads``, MAE p50 отдельно для D+1 и D+2.
"""

import numpy as np
import pandas as pd

from app.forecast import data, model

MONTHS = ["2025-10", "2025-11", "2025-12", "2026-01"]
H = data.load_hourly()
WIND_COLS = ["ens_ws100_mean", "ws100"]
OFFSETS = range(-3, 4)


def _same_run_trajectory(index: pd.DatetimeIndex, lead: int) -> pd.DataFrame:
    """Признаки t±3 для одного lead; соседние часы не выбирают выпуск самостоятельно."""
    if index.empty:
        return pd.DataFrame(index=index)
    expanded = pd.date_range(index.min() - pd.Timedelta(hours=3), index.max() + pd.Timedelta(hours=3), freq="h")
    same_run = model.features(expanded, lead)
    out = pd.DataFrame(index=index)

    for column in WIND_COLS:
        window_cols = []
        for offset in OFFSETS:
            name = f"traj_{column}_{offset:+d}h"
            out[name] = same_run[column].shift(-offset).reindex(index)
            window_cols.append(name)
        window = out[window_cols]
        out[f"traj_{column}_diff_p1_m1"] = out[f"traj_{column}_+1h"] - out[f"traj_{column}_-1h"]
        out[f"traj_{column}_mean_7h"] = window.mean(axis=1)
        out[f"traj_{column}_std_7h"] = window.std(axis=1)
        out[f"traj_{column}_max_7h"] = window.max(axis=1)

    sin_prev = same_run["dir_sin"].shift(1).reindex(index)
    cos_prev = same_run["dir_cos"].shift(1).reindex(index)
    sin_next = same_run["dir_sin"].shift(-1).reindex(index)
    cos_next = same_run["dir_cos"].shift(-1).reindex(index)
    # sin/cos разности углов направления между t-1 и t+1 без разрыва на 0°/360°.
    out["traj_dir_change_sin"] = sin_next * cos_prev - cos_next * sin_prev
    out["traj_dir_change_cos"] = cos_next * cos_prev + sin_next * sin_prev
    return out


def trajectory(index: pd.DatetimeIndex, leads: pd.Series) -> pd.DataFrame:
    """Базовые признаки и траектория; каждая группа часов строится из своего фиксированного выпуска."""
    base = model.features_at(index, leads)
    parts = []
    for lead in sorted(set(leads.dropna().astype(int))):
        target = index[leads.reindex(index).to_numpy() == lead]
        parts.append(_same_run_trajectory(target, lead))
    extra = pd.concat(parts).reindex(index)
    return base.join(extra)


def table(end: pd.Timestamp) -> pd.DataFrame:
    hist = H.loc[:end]
    parts = []
    for lead in (1, 2, 3):
        leads = pd.Series(lead, index=hist.index)
        parts.append(trajectory(hist.index, leads).join(hist[["power"]]))
    return pd.concat(parts).dropna(subset=["ws100", "power"])


def gbr():
    return model.HistGradientBoostingRegressor(
        loss="quantile",
        quantile=0.5,
        max_iter=200,
        learning_rate=0.08,
        max_leaf_nodes=31,
        min_samples_leaf=40,
        l2_regularization=1.0,
        random_state=0,
    )


EXTRA = [
    *[f"traj_{column}_{offset:+d}h" for column in WIND_COLS for offset in OFFSETS],
    *[f"traj_{column}_{suffix}" for column in WIND_COLS for suffix in ("diff_p1_m1", "mean_7h", "std_7h", "max_7h")],
    "traj_dir_change_sin",
    "traj_dir_change_cos",
]


def run() -> pd.DataFrame:
    rows = []
    for month in MONTHS:
        start = pd.Timestamp(month + "-01")
        end = start + pd.offsets.MonthEnd(0) + pd.Timedelta(hours=23)
        until = start - pd.Timedelta(days=1, hours=1)
        train = table(until)
        base_model = gbr().fit(train[model.FEATURES], train["power"])
        trajectory_model = gbr().fit(train[model.FEATURES + EXTRA], train["power"])
        hist = H.loc[start:end]
        for horizon in (1, 2):
            leads = model.horizon_leads(hist.index, horizon)
            x = trajectory(hist.index, leads)
            ok = x["ws100"].notna() & hist["power"].notna()
            y = hist.loc[ok, "power"]
            pred_base = np.clip(base_model.predict(x.loc[ok, model.FEATURES]), 0, 1)
            pred_trajectory = np.clip(trajectory_model.predict(x.loc[ok, model.FEATURES + EXTRA]), 0, 1)
            rows.append(
                {
                    "month": month,
                    "lead": horizon,
                    "hours": int(ok.sum()),
                    "base": float(np.abs(pred_base - y).mean()),
                    "trajectory": float(np.abs(pred_trajectory - y).mean()),
                }
            )
        print(rows[-2:], flush=True)

    result = pd.DataFrame(rows)
    result["gain"] = result["base"] - result["trajectory"]
    monthly = result.groupby("month")["gain"].mean()
    print(result.round(4).to_string(index=False))
    print(
        "mean:",
        result[["base", "trajectory"]].mean().round(4).to_dict(),
        "| months gain >= 0.002:",
        int((monthly >= 0.002).sum()),
        "of 4",
        "| decision:",
        "брать" if int((monthly >= 0.002).sum()) >= 3 else "не брать",
    )
    return result


if __name__ == "__main__":
    run()
