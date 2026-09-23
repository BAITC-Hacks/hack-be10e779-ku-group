"""Изолированный эксперимент новых погодных признаков; production-код не изменяет.

Запуск из backend/:
    python experiments/features_exp.py fetch
    python experiments/features_exp.py evaluate
"""

import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import ROOT_DIR
from app.forecast import data, model

URL = "https://previous-runs-api.open-meteo.com/v1/forecast"
START, END = "2024-01-01", "2026-03-02"
EXTRA_VARS = ["surface_pressure", "wind_speed_80m", "wind_speed_120m", "relative_humidity_2m"]
SOURCES = {"best_match": None, "ecmwf_ifs025": "ecmwf_ifs025", "icon_global": "icon_global"}
WEATHER_DIR = ROOT_DIR / "data" / "weather"
MONTHS = ["2025-10", "2025-11", "2025-12", "2026-01"]
WIND_FEATURES = [f"{source}_{height}" for source in SOURCES for height in ("ws80", "ws120")]
EXTRA_FEATURES = ["rho", "rho_ws100_cube", *WIND_FEATURES]
VARIANTS = {
    "base": ([], False),
    "rho": (["rho"], False),
    "rho_ws100_cube": (["rho_ws100_cube"], False),
    "wind_80_120": (WIND_FEATURES, False),
    "recency_weight": ([], True),
    "all": (EXTRA_FEATURES, True),
}


def exp_path(source: str) -> Path:
    return WEATHER_DIR / f"exp_{source}.json"


def fetch() -> None:
    """Скачать только экспериментальные Previous Runs day1/2/3 в отдельные файлы."""
    WEATHER_DIR.mkdir(parents=True, exist_ok=True)
    hourly = ",".join(f"{variable}_previous_day{day}" for variable in EXTRA_VARS for day in (1, 2, 3))
    for source, api_model in SOURCES.items():
        params = {
            "latitude": data.STATION[0],
            "longitude": data.STATION[1],
            "hourly": hourly,
            "start_date": START,
            "end_date": END,
            "timezone": "Asia/Almaty",
            "wind_speed_unit": "ms",
        }
        if api_model is not None:
            params["models"] = api_model
        response = httpx.get(URL, params=params, timeout=180)
        response.raise_for_status()
        payload = response.json()
        exp_path(source).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        print(f"Сохранено {exp_path(source).relative_to(ROOT_DIR)}")


@lru_cache(maxsize=len(SOURCES))
def load_extra(source: str) -> pd.DataFrame:
    payload = json.loads(exp_path(source).read_text(encoding="utf-8"))
    frame = pd.DataFrame(payload["hourly"])
    frame["time"] = pd.to_datetime(frame["time"])
    return frame.set_index("time")


def extra_features(index: pd.DatetimeIndex, lead: int, base: pd.DataFrame) -> pd.DataFrame:
    """Кандидаты для одного выпуска погоды; давление Open-Meteo приходит в hPa, поэтому переводим в Pa."""
    best = load_extra("best_match").reindex(index)
    pressure_pa = best[f"surface_pressure_previous_day{lead}"] * 100.0
    temperature_k = base["temp"] + 273.15
    rho = pressure_pa / (287.05 * temperature_k)
    out = pd.DataFrame(index=index)
    out["rho"] = rho
    out["rho_ws100_cube"] = rho * base["ws100"].clip(lower=0) ** 3
    for source in SOURCES:
        source_frame = load_extra(source).reindex(index)
        out[f"{source}_ws80"] = source_frame[f"wind_speed_80m_previous_day{lead}"]
        out[f"{source}_ws120"] = source_frame[f"wind_speed_120m_previous_day{lead}"]
    return out


def features_for_leads(index: pd.DatetimeIndex, leads: pd.Series) -> pd.DataFrame:
    parts = []
    for lead in sorted(set(leads.astype(int))):
        subset = index[leads.to_numpy() == lead]
        base = model.features(subset, lead)
        parts.append(base.join(extra_features(subset, lead, base)))
    return pd.concat(parts).reindex(index)


def training_table(end: pd.Timestamp) -> pd.DataFrame:
    history = data.load_hourly().loc[:end]
    parts = []
    for lead in model.LEADS:
        base = model.features(history.index, lead)
        x = base.join(extra_features(history.index, lead, base))
        parts.append(x.join(history[["power"]]))
    return pd.concat(parts).dropna(subset=["ws100", "power"])


def sample_weights(index: pd.DatetimeIndex, trained_until: pd.Timestamp) -> np.ndarray:
    age_days = np.maximum((trained_until - index).total_seconds() / 86_400, 0)
    return np.power(0.5, age_days / 180.0)


def evaluate() -> dict:
    """Скользящий holdout как в model.holdout_metrics(), но только для медианного прогноза."""
    hourly = data.load_hourly()
    records = []
    for month in MONTHS:
        start = pd.Timestamp(f"{month}-01")
        end = start + pd.offsets.MonthEnd(0) + pd.Timedelta(hours=23)
        trained_until = start - pd.Timedelta(hours=1)
        train = training_table(trained_until)
        fitted = {}

        def fit_variant(variant: str, train=train, trained_until=trained_until):
            extra_columns, weighted = VARIANTS[variant]
            columns = [*model.FEATURES, *extra_columns]
            weights = sample_weights(train.index, trained_until) if weighted else None
            estimator = model._gbr(0.5).fit(train[columns], train["power"], sample_weight=weights)
            return variant, estimator

        # Независимые варианты считаются параллельно; данные и параметры у них одинаковые.
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = [executor.submit(fit_variant, variant) for variant in VARIANTS]
            for future in as_completed(futures):
                variant, estimator = future.result()
                fitted[variant] = estimator
                print(f"Обучено: {month} / {variant}", flush=True)

        fact_month = hourly.loc[start:end, "power"]
        for horizon in (1, 2):
            leads = model.horizon_leads(fact_month.index, horizon)
            x = features_for_leads(fact_month.index, leads)
            valid = x["ws100"].notna() & fact_month.notna()
            fact = fact_month[valid]
            for variant, (extra_columns, _) in VARIANTS.items():
                columns = [*model.FEATURES, *extra_columns]
                prediction = np.clip(fitted[variant].predict(x.loc[valid, columns]), 0, 1)
                records.append(
                    {
                        "month": month,
                        "lead": horizon,
                        "variant": variant,
                        "hours": int(valid.sum()),
                        "mae": float(np.mean(np.abs(prediction - fact.to_numpy()))),
                    }
                )
        print(f"Готово: {month}", flush=True)

    result = summarize(pd.DataFrame(records))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print_markdown(result)
    return result


def summarize(scores: pd.DataFrame) -> dict:
    base = scores[scores["variant"] == "base"].set_index(["month", "lead"])["mae"]
    rows = []
    for variant in VARIANTS:
        current = scores[scores["variant"] == variant].set_index(["month", "lead"])["mae"]
        monthly_improvements = {}
        for month in MONTHS:
            improvements = [base.loc[(month, lead)] - current.loc[(month, lead)] for lead in (1, 2)]
            monthly_improvements[month] = float(np.mean(improvements))
        wins = sum(value >= 0.002 for value in monthly_improvements.values())
        rows.append(
            {
                "variant": variant,
                "mae_d1": float(scores[(scores["variant"] == variant) & (scores["lead"] == 1)]["mae"].mean()),
                "mae_d2": float(scores[(scores["variant"] == variant) & (scores["lead"] == 2)]["mae"].mean()),
                "monthly_improvement": monthly_improvements,
                "months_better_by_0_002": wins,
                "decision": "брать" if variant != "base" and wins >= 3 else "не брать",
            }
        )
    return {"criterion": "среднее улучшение MAE D+1/D+2 >= 0.002 минимум в 3 из 4 месяцев", "rows": rows}


def print_markdown(result: dict) -> None:
    print("\n| Вариант | MAE D+1 | MAE D+2 | Окт | Ноя | Дек | Янв | Месяцев ≥0.002 | Решение |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |")
    for row in result["rows"]:
        gains = row["monthly_improvement"]
        print(
            f"| {row['variant']} | {row['mae_d1']:.4f} | {row['mae_d2']:.4f} | "
            f"{gains['2025-10']:+.4f} | {gains['2025-11']:+.4f} | {gains['2025-12']:+.4f} | "
            f"{gains['2026-01']:+.4f} | {row['months_better_by_0_002']} | {row['decision']} |"
        )


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "evaluate"
    if command == "fetch":
        fetch()
    elif command == "evaluate":
        evaluate()
    else:
        raise SystemExit("Использование: python experiments/features_exp.py [fetch|evaluate]")


if __name__ == "__main__":
    main()
