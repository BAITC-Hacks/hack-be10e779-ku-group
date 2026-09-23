"""Эксперимент 23.09 ~16:50: взвешенный ансамбль источников NWP — вес каждого источника ~ 1/RMSE² против
измеренного ветра станции (H["wind"]), посчитанный по часам СТРОГО ДО начала оцениваемого месяца (без
подглядывания, та же граница, что и обучение модели) — вместо равного среднего ens_ws100_mean/ens_ws10_mean.
Добавляем ws100_wtd/ws10_wtd как ДОПОЛНИТЕЛЬНЫЕ признаки (base FEATURES остаются), а не замену.

Источник идеи и цифр: Yakoub, Mathew, Leal (2023), "Direct and indirect short-term aggregated turbine- and
farm-level wind power forecasts integrating several NWP sources", Heliyon, doi:10.1016/j.heliyon.2023.e21479 —
взвешивание источников по W = RMSE⁻² / Σ RMSE⁻² даёt 8–30% выигрыша по RMSE/MAE относительно одного источника
NWP (см. docs/research/innovation.md, метод №1). У нас веса считаются не по мощности, а по скорости ветра
(измеренной станцией) — так как есть измеренный ветер на каждый час, а не только факт мощности.

Оценка — как model.holdout_metrics: окт 2025 – янв 2026, граница обучения S − 1 сут − 1 ч, выпуски по
horizon_leads. Порог "помогло": −0.002 MAE в ≥3 из 4 месяцев (как в остальных эксперимentах 23.09)."""

import numpy as np
import pandas as pd

from app.forecast import data, model

MONTHS = ["2025-10", "2025-11", "2025-12", "2026-01"]
H = data.load_hourly()
SRC100 = model.ENS100
SRC10 = model.ENS10


def source_weights(until: pd.Timestamp, cols: list[str]) -> dict[str, float]:
    """Вес источника ~ 1/RMSE² против измеренного ветра станции, на выпусках lead=1 (самый свежий сигнал),
    по часам до `until` включительно. Источник с < 60 часами пересечения или нулевой ошибкой — вес 0;
    если сигнала нет вообще — равные веса (не ломаем признак)."""
    hist = H.loc[:until]
    f = model.features(hist.index, 1)
    rmse = {}
    for c in cols:
        e = (f[c] - hist["wind"]).dropna()
        rmse[c] = float(np.sqrt((e ** 2).mean())) if len(e) >= 60 else np.nan
    inv = {c: 1 / (r ** 2) for c, r in rmse.items() if pd.notna(r) and r > 0}
    total = sum(inv.values())
    if not total:
        return {c: 1 / len(cols) for c in cols}
    return {c: inv.get(c, 0) / total for c in cols}


def weighted(x: pd.DataFrame, w100: dict, w10: dict) -> pd.DataFrame:
    out = x.copy()
    out["ws100_wtd"] = sum(x[c] * w for c, w in w100.items())
    out["ws10_wtd"] = sum(x[c] * w for c, w in w10.items())
    return out


def gbr():
    return model.HistGradientBoostingRegressor(loss="quantile", quantile=0.5, max_iter=200, learning_rate=0.08,
                                                 max_leaf_nodes=31, min_samples_leaf=40, l2_regularization=1.0,
                                                 random_state=0)


EXTRA = ["ws100_wtd", "ws10_wtd"]
rows = []
for mon in MONTHS:
    start = pd.Timestamp(mon + "-01")
    end = start + pd.offsets.MonthEnd(0) + pd.Timedelta(hours=23)
    until = start - pd.Timedelta(days=1, hours=1)

    w100 = source_weights(until, SRC100)
    w10 = source_weights(until, SRC10)
    print(mon, "w100:", {k: round(v, 2) for k, v in w100.items()},
          "w10:", {k: round(v, 2) for k, v in w10.items()}, flush=True)

    t = model.training_table(until)
    tw = weighted(t, w100, w10)
    base_m = gbr().fit(t[model.FEATURES], t["power"])
    wtd_m = gbr().fit(tw[model.FEATURES + EXTRA], t["power"])

    hist = H.loc[start:end]
    for lead in (1, 2):
        leads = model.horizon_leads(hist.index, lead)
        x = model.features_at(hist.index, leads)
        xw = weighted(x, w100, w10)
        ok = x["ws100"].notna() & hist["power"].notna()
        y = hist.loc[ok, "power"]
        pb = np.clip(base_m.predict(x.loc[ok, model.FEATURES]), 0, 1)
        pw = np.clip(wtd_m.predict(xw.loc[ok, model.FEATURES + EXTRA]), 0, 1)
        rows.append({"month": mon, "lead": lead, "base": np.abs(pb - y).mean(), "weighted": np.abs(pw - y).mean()})
    print(rows[-2:], flush=True)

df = pd.DataFrame(rows)
df["gain"] = df["base"] - df["weighted"]
print(df.round(4).to_string(index=False))
print("mean:", df[["base", "weighted"]].mean().round(4).to_dict(), "| months better (both leads avg, >=0.002):",
      int((df.groupby("month")["gain"].mean() > 0.002).sum()), "of", len(MONTHS))
