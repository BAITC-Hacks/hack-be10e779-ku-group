"""Эксперимент 23.09 ~15:30: смесь модели с кривой мощности, станция как среднее турбин, параметры бустинга.
Оценка как в model.holdout_metrics: окт 2025–янв 2026, граница обучения S − 1 сут − 1 ч, выпуски погоды по horizon_leads.
Вес смеси подбирается на ПРОШЛОМ месяце (для окт — на сентябре), без подглядывания в оцениваемый месяц."""

import sys

import numpy as np
import pandas as pd

from app.forecast import data, model

MONTHS = ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01"]
H = data.load_hourly()


def month_frame(mon: str, params: dict) -> pd.DataFrame:
    start = pd.Timestamp(mon + "-01")
    end = start + pd.offsets.MonthEnd(0) + pd.Timedelta(hours=23)
    until = start - pd.Timedelta(days=1, hours=1)
    t = model.training_table(until)
    x_tr = t[model.FEATURES]
    g = lambda: model.HistGradientBoostingRegressor(**{**dict(loss="quantile", quantile=0.5, max_iter=200,
        learning_rate=0.08, max_leaf_nodes=31, min_samples_leaf=40, l2_regularization=1.0, random_state=0), **params})
    m50 = g().fit(x_tr, t["power"])
    ok1, ok2 = t["t1_power"].notna(), t["t2_power"].notna()
    m1 = g().fit(x_tr[ok1], t.loc[ok1, "t1_power"])
    m2 = g().fit(x_tr[ok2], t.loc[ok2, "t2_power"])
    curve = model.power_curve(until)
    hist = H.loc[start:end]
    out = []
    for lead in (1, 2):
        x = model.features_at(hist.index, model.horizon_leads(hist.index, lead))
        ok = x["ws100"].notna() & hist["power"].notna()
        xs = x[ok]
        out.append(pd.DataFrame({
            "lead": lead, "y": hist.loc[ok, "power"],
            "model": np.clip(m50.predict(xs[model.FEATURES]), 0, 1),
            "turb": np.clip((m1.predict(xs[model.FEATURES]) + m2.predict(xs[model.FEATURES])) / 2, 0, 1),
            "curve": model.apply_curve(curve, xs["ens_ws100_mean"].fillna(xs["ws100"])),
        }, index=xs.index))
    return pd.concat(out)


def run(label: str, params: dict) -> None:
    frames = {m: month_frame(m, params) for m in MONTHS}
    rows = []
    for i, mon in enumerate(MONTHS[1:], 1):
        prev, cur = frames[MONTHS[i - 1]], frames[mon]
        # вес смеси — лучший на прошлом месяце
        ws = np.linspace(0, 1, 21)
        w = ws[np.argmin([np.abs(a * prev.model + (1 - a) * prev.curve - prev.y).mean() for a in ws])]
        blend = w * cur.model + (1 - w) * cur.curve
        daily_model = (cur.model - cur.y).abs().groupby(cur.index.date).mean()
        daily_curve = (cur.curve - cur.y).abs().groupby(cur.index.date).mean()
        daily_blend = (blend - cur.y).abs().groupby(cur.index.date).mean()
        rows.append({"month": mon, "w_model": round(w, 2),
                     "model": (cur.model - cur.y).abs().mean(), "turb_avg": (cur.turb - cur.y).abs().mean(),
                     "curve": (cur.curve - cur.y).abs().mean(), "blend": (blend - cur.y).abs().mean(),
                     "days_model_worse_curve": int((daily_model > daily_curve).sum()),
                     "days_blend_worse_curve": int((daily_blend > daily_curve).sum()), "days": len(daily_model)})
    df = pd.DataFrame(rows).round(4)
    print(f"\n=== {label} {params}\n", df.to_string(index=False))
    print("mean:", df[["model", "turb_avg", "curve", "blend"]].mean().round(4).to_dict(), flush=True)


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "base"
    if which == "base":
        run("база", {})
    elif which == "slow":
        run("медленнее и глубже", {"max_iter": 500, "learning_rate": 0.04, "min_samples_leaf": 60})
