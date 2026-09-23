"""Эксперимент 23.09 ~17:00: эмпирическая кривая мощности как ВХОДНОЙ ПРИЗНАК на каждый источник ветра
(curve(ecmwf_ws100), curve(icon_ws100), curve(gfs_ws100), curve(ws100)) — а не финальный блендинг прогноза
модели с кривой (это уже проверено 23.09 в model_exp.py и не помогло). Идея: дать бустингу физически осмысленную
нелинейную трансформацию каждого источника как признак, пусть сам решает, использовать её или нет.
Общая мотивация в литературе (не 1:1 наш случай): коррекция входного ветра перед подачей в модель вместо
прямого power-curve постпроцессинга снижает CRPS с 1.43 до 1.13 (-21%) — "Improving wind power forecasting
accuracy through bias correction of wind speed predictions", Sustainable Energy Technologies and Assessments,
2025, https://www.sciencedirect.com/science/article/pii/S2213138825004308 (цифры из сводки поиска, авторы и
доступ к полному тексту не проверены — [?] см. docs/research/innovation.md, метод №3).

Оценка — как model.holdout_metrics: окт 2025 – янв 2026, граница обучения S − 1 сут − 1 ч, выпуски по
horizon_leads. Порог "помогло": −0.002 MAE в ≥3 из 4 месяцев."""

import numpy as np
import pandas as pd

from app.forecast import data, model

MONTHS = ["2025-10", "2025-11", "2025-12", "2026-01"]
H = data.load_hourly()
CURVE_SRC = ["ws100", *model.ENS100]


def with_curve(x: pd.DataFrame, curve: pd.Series) -> pd.DataFrame:
    out = x.copy()
    for c in CURVE_SRC:
        out[f"curve_{c}"] = model.apply_curve(curve, x[c])
    return out


def gbr():
    return model.HistGradientBoostingRegressor(loss="quantile", quantile=0.5, max_iter=200, learning_rate=0.08,
                                                 max_leaf_nodes=31, min_samples_leaf=40, l2_regularization=1.0,
                                                 random_state=0)


EXTRA = [f"curve_{c}" for c in CURVE_SRC]
rows = []
for mon in MONTHS:
    start = pd.Timestamp(mon + "-01")
    end = start + pd.offsets.MonthEnd(0) + pd.Timedelta(hours=23)
    until = start - pd.Timedelta(days=1, hours=1)

    curve = model.power_curve(until)
    t = model.training_table(until)
    tc = with_curve(t, curve)
    base_m = gbr().fit(t[model.FEATURES], t["power"])
    curve_m = gbr().fit(tc[model.FEATURES + EXTRA], t["power"])

    hist = H.loc[start:end]
    for lead in (1, 2):
        leads = model.horizon_leads(hist.index, lead)
        x = model.features_at(hist.index, leads)
        xc = with_curve(x, curve)
        ok = x["ws100"].notna() & hist["power"].notna()
        y = hist.loc[ok, "power"]
        pb = np.clip(base_m.predict(x.loc[ok, model.FEATURES]), 0, 1)
        pc = np.clip(curve_m.predict(xc.loc[ok, model.FEATURES + EXTRA]), 0, 1)
        rows.append({"month": mon, "lead": lead, "base": np.abs(pb - y).mean(), "curve_feat": np.abs(pc - y).mean()})
    print(rows[-2:], flush=True)

df = pd.DataFrame(rows)
df["gain"] = df["base"] - df["curve_feat"]
print(df.round(4).to_string(index=False))
print("mean:", df[["base", "curve_feat"]].mean().round(4).to_dict(), "| months better (both leads avg, >=0.002):",
      int((df.groupby("month")["gain"].mean() > 0.002).sum()), "of", len(MONTHS))
