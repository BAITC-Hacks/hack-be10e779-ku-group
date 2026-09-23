"""Командная строка: ретроспективный прогон февраля 2026 и метрики.

    cd backend && python -m app.forecast.cli backtest   # 28 прогнозов → outputs/forecast_feb2026.csv
    cd backend && python -m app.forecast.cli metrics    # проверка на январе 2026 → outputs/metrics.json
    cd backend && python -m app.forecast.cli weather    # скачать архивные прогнозы погоды заново
"""

import json
import sys

import pandas as pd

from app.config import ROOT_DIR
from app.forecast import model, weather

OUT = ROOT_DIR / "outputs"


def backtest(start: str = "2026-01-31", end: str = "2026-02-27") -> pd.DataFrame:
    """28 последовательных выпусков тем же путём, что и в интерфейсе (агент, планировщик без LLM):
    калиброванный интервал, выбор источников, паспорт и сохранённые версии; пересмотр — по сохранённому прошлому выпуску."""
    from app.forecast import agent

    rows = []
    for d in pd.date_range(start, end, freq="1D"):
        issue = d.strftime("%Y-%m-%d")
        res = agent.run(issue, planner_only=True)
        p = res["passport"]
        for h in res["hours"]:
            rows.append({"issue_date": issue, "issued_at": p["decision_at"], "forecast_id": p["forecast_id"],
                         "outside_test_period": pd.Timestamp(h["time"]) > pd.Timestamp("2026-02-28 23:00"), **h})
        upd = res["analysis"]["update"]
        print(f"{issue}: D+1 {res['summary']['energy_d1']} ч, пересмотр {upd.get('hours_changed_10pp', 0)} ч, "
              f"карточек {len(res['cards'])}, {p['forecast_id']}", flush=True)
    df = pd.DataFrame(rows)
    OUT.mkdir(exist_ok=True)
    df.to_csv(OUT / "forecast_feb2026.csv", index=False)
    # итоговый ряд на тест: для каждого часа февраля — самый свежий прогноз (сутки D+1)
    final = df[df["lead_day"] == 1][["time", "p50", "p10", "p90", "t1", "t2", "issue_date", "forecast_id"]]
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
