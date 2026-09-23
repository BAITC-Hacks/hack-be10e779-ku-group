"""Командная строка: ретроспективный прогон февраля 2026 и метрики.

    cd backend && python -m app.forecast.cli backtest   # 28 прогнозов → outputs/forecast_feb2026.csv
    cd backend && python -m app.forecast.cli metrics    # проверка на январе 2026 → outputs/metrics.json
    cd backend && python -m app.forecast.cli weather    # скачать архивные прогнозы погоды заново
"""

import json
import sys

import pandas as pd

from app.config import ROOT_DIR
from app.forecast import model, pipeline, weather

OUT = ROOT_DIR / "outputs"


def backtest(start: str = "2026-01-31", end: str = "2026-02-27") -> pd.DataFrame:
    rows = []
    for d in pd.date_range(start, end, freq="1D"):
        issue = d.strftime("%Y-%m-%d")
        res = pipeline.full_cycle(issue)
        for h in res["hours"]:
            rows.append({"issue_date": issue, "issued_at": f"{issue}T23:59", **h})
        print(f"{issue}: D+1 {res['summary']['energy_d1']} ч, флагов {len(res['flags'])}", flush=True)
    df = pd.DataFrame(rows)
    OUT.mkdir(exist_ok=True)
    df.to_csv(OUT / "forecast_feb2026.csv", index=False)
    # итоговый ряд на тест: для каждого часа февраля — самый свежий прогноз (горизонт D+1)
    final = df[df["lead_day"] == 1][["time", "p50", "p10", "p90", "t1", "t2", "issue_date"]]
    final.to_csv(OUT / "forecast_feb2026_final.csv", index=False)
    return df


def main(argv: list[str]) -> None:
    cmd = argv[0] if argv else "backtest"
    if cmd == "backtest":
        df = backtest()
        print(f"Сохранено: outputs/forecast_feb2026.csv ({len(df)} строк), outputs/forecast_feb2026_final.csv")
    elif cmd == "metrics":
        m = model.holdout_metrics()
        OUT.mkdir(exist_ok=True)
        (OUT / "metrics.json").write_text(json.dumps(m, ensure_ascii=False, indent=2), encoding="utf-8")
        for r in m["rows"]:
            print(r)
    elif cmd == "weather":
        weather.fetch_all(refresh=True)
        print("Погода обновлена:", weather.CACHE)
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
