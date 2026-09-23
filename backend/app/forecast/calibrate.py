"""Калибровка интервала p10–p90 (конформная, по режимам ветра) и точность источников погоды.

Квантильная модель даёт слишком узкий интервал (покрытие ~0.69 при цели 0.80). Поправка — split-conformal (CQR):
на отложенных месяцах считаем «насколько факт вылез за интервал» E = max(p10 − y, y − p90) и берём её квантиль
отдельно для каждого режима ветра (слабый / рабочий / сильный) — ошибка сильно зависит от режима.
Калибровка строится на окт–дек 2025, проверяется на январе 2026 (данные, которых калибровка не видела).
"""

import json
from functools import lru_cache

import numpy as np
import pandas as pd

from app.config import ROOT_DIR
from app.forecast import data, model, weather

OUT = ROOT_DIR / "outputs" / "calibration.json"
BINS = [0, 4, 8, 12, 100]  # м/с по ансамблю ветра на 100 м
LABELS = ["<4", "4–8", "8–12", "≥12"]
TARGET = 0.80
CAL_MONTHS = ["2025-10", "2025-11", "2025-12"]
CHECK_MONTH = "2026-01"


def _month_predictions(mon: str) -> pd.DataFrame:
    """Прогноз на месяц моделью, обученной только до его начала, для обоих горизонтов."""
    start = pd.Timestamp(mon + "-01")
    end = start + pd.offsets.MonthEnd(0) + pd.Timedelta(hours=23)
    f = model.get_forecaster(str(start - pd.Timedelta(hours=1)))
    hist = data.load_hourly().loc[start:end]
    parts = []
    for lead in (1, 2):
        x = model.features_at(hist.index, model.horizon_leads(hist.index, lead))
        ok = x["ws100"].notna() & hist["power"].notna()
        p = f.predict(x[ok])
        p["y"] = hist.loc[ok, "power"]
        p["ws"] = x.loc[ok, "ens_ws100_mean"].fillna(x.loc[ok, "ws100"])
        p["lead"] = lead
        parts.append(p)
    return pd.concat(parts)


def _regime(ws: pd.Series) -> pd.Series:
    return pd.cut(ws, BINS, labels=LABELS, right=False)


def build() -> dict:
    cal = pd.concat([_month_predictions(m) for m in CAL_MONTHS])
    e = np.maximum(cal["p10"] - cal["y"], cal["y"] - cal["p90"])
    reg = _regime(cal["ws"])
    q = {}
    for lab in LABELS:
        s = e[reg == lab]
        n = len(s)
        level = min(1.0, np.ceil((n + 1) * TARGET) / n) if n else TARGET
        q[lab] = round(float(np.quantile(s, level)), 4) if n else 0.0
    chk = _month_predictions(CHECK_MONTH)
    before = float(((chk["y"] >= chk["p10"]) & (chk["y"] <= chk["p90"])).mean())
    lo, hi = apply(chk["p10"], chk["p90"], chk["ws"], q)
    after = float(((chk["y"] >= lo) & (chk["y"] <= hi)).mean())
    res = {
        "method": "split-conformal (CQR) по режимам ветра",
        "calibrated_on": CAL_MONTHS, "checked_on": CHECK_MONTH, "target": TARGET,
        "widen_by_regime": q,
        "coverage_before": round(before, 3), "coverage_after": round(after, 3),
        "width_before": round(float((chk["p90"] - chk["p10"]).mean()), 3),
        "width_after": round(float((hi - lo).mean()), 3),
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    load.cache_clear()
    return res


def apply(p10, p90, ws, q: dict):
    widen = _regime(pd.Series(ws)).astype(object).map(q).fillna(0).to_numpy(dtype=float)
    return np.clip(np.asarray(p10) - widen, 0, 1), np.clip(np.asarray(p90) + widen, 0, 1)


@lru_cache(maxsize=1)
def load() -> dict:
    return json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else build()


def source_skill(until: pd.Timestamp, days: int = 30) -> list[dict]:
    """Точность каждого источника погоды за последние `days` дней ДО момента прогноза: MAE прогнозного ветра на 100 м
    (10 м — для моделей без 100 м) против ветра, измеренного на турбинах. Факт после момента прогноза не используется."""
    start = until - pd.Timedelta(days=days)
    measured = data.load_hourly()["wind"].loc[start:until]
    ens = weather.ensemble_for_lead(1).reindex(measured.index)
    best = weather.for_lead(1).reindex(measured.index)["wind_speed_100m"]
    rows = []
    for name, series in [("best_match_ws100", best), *[(c, ens[c]) for c in ens.columns]]:
        ok = series.notna() & measured.notna()
        if ok.sum() < 24:
            rows.append({"source": name, "mae_ms": None, "hours": int(ok.sum()), "missing_share": 1.0})
            continue
        # 10 м ниже высоты ступицы — сравниваем после линейной поправки уровня (отношение средних)
        s = series[ok] * (measured[ok].mean() / series[ok].mean()) if name.endswith("ws10") else series[ok]
        rows.append({"source": name, "mae_ms": round(float((s - measured[ok]).abs().mean()), 3),
                     "hours": int(ok.sum()), "missing_share": round(float(series.isna().mean()), 3)})
    return sorted(rows, key=lambda r: (r["mae_ms"] is None, r["mae_ms"] or 0))
