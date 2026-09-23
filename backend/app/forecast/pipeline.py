"""Шаги агентного цикла как обычные функции: погода → признаки → модель → прогноз → анализ → сравнение с прошлым выпуском.

Их вызывает агент (app/forecast/agent.py) как инструменты; они же используются в ретроспективном прогоне (cli.py).
Всё детерминировано: одинаковый вход — одинаковый выход.
"""

from dataclasses import dataclass

import numpy as np
import pandas as pd

from app.forecast import data, model, weather

FIRST_ISSUE = pd.Timestamp("2026-01-31")
LAST_ISSUE = pd.Timestamp("2026-02-27")
LOW = 0.05  # «почти нет выработки»
WIDE_MEAN = 0.60  # средняя ширина p10–p90 выпуска — верхняя четверть по февралю (медиана 0.52 после калибровки)


def issue_window(issue_date: str) -> tuple[pd.Timestamp, pd.DatetimeIndex, pd.DatetimeIndex]:
    d = pd.Timestamp(issue_date).normalize()
    d1 = pd.date_range(d + pd.Timedelta(days=1), periods=24, freq="1h")
    d2 = pd.date_range(d + pd.Timedelta(days=2), periods=24, freq="1h")
    return d, d1, d2


def check_issue_date(issue_date: str) -> pd.Timestamp:
    try:
        d = pd.Timestamp(issue_date).normalize()
    except ValueError as exc:
        raise ValueError("Дата прогноза в формате YYYY-MM-DD") from exc
    if not FIRST_ISSUE <= d <= LAST_ISSUE:
        raise ValueError("Дата прогноза — с 2026-01-31 по 2026-02-27 (тестовый период ТЗ: 01–28.02.2026)")
    return d


def window_leads(issue_date: str) -> pd.Series:
    d, d1, d2 = issue_window(issue_date)
    return model.run_lead(d1.append(d2), model.issue_moment(d))


def get_weather(issue_date: str) -> dict:
    """Шаг 1. Архивный прогноз погоды: для каждого часа — самый свежий выпуск, опубликованный до конца дня issue_date."""
    leads = window_leads(issue_date)
    ws = pd.Series([weather.for_lead(int(n))["wind_speed_100m"].get(h) for h, n in leads.items()], index=leads.index)
    counts = leads.value_counts().sort_index()
    return {
        "source": weather.SOURCE,
        "runs": ", ".join(f"выпуск за {n} сут — {c} ч" for n, c in counts.items())
        + f"; задержка публикации {weather.PUBLISH_DELAY_H} ч; все выпуски опубликованы не позже {issue_date} 23:59",
        "leads_by_hour": {h.strftime("%Y-%m-%dT%H:%M"): int(n) for h, n in leads.items()},
        "hours": 48,
        "missing_hours": int(ws.isna().sum()),
        "wind_100m_mean": round(float(ws.mean()), 2),
        "wind_100m_max": round(float(ws.max()), 2),
    }


def prepare(issue_date: str) -> pd.DataFrame:
    """Шаг 2. Признаки на 48 часов; пропуски погоды заполняются соседними часами (не больше 3 подряд)."""
    leads = window_leads(issue_date)
    x = model.features_at(leads.index, leads)
    return x.interpolate(limit=3, limit_direction="both")


def run_model(x: pd.DataFrame) -> pd.DataFrame:
    """Шаг 3. Прогноз станции (p10/p50/p90), по турбинам и базовая кривая мощности."""
    return model.get_forecaster().predict(x)


def hourly_forecast(issue_date: str, x: pd.DataFrame, pred: pd.DataFrame) -> list[dict]:
    """Шаг 4. Почасовой прогноз в формате контракта; факт — если он есть в данных."""
    fact = data.load_hourly()["power"]
    d = pd.Timestamp(issue_date).normalize()
    rows = []
    for t in pred.index:
        a = fact.get(t)
        rows.append({
            "time": t.strftime("%Y-%m-%dT%H:%M"),
            "lead_day": int((t.normalize() - d).days),  # 1 — сутки D+1, 2 — D+2
            "weather_run_days": int(x.at[t, "lead"]),  # из выпуска за сколько суток взята погода
            "p50": round(float(pred.at[t, "p50"]), 4),
            "p10": round(float(pred.at[t, "p10"]), 4),
            "p90": round(float(pred.at[t, "p90"]), 4),
            "t1": round(float(pred.at[t, "t1"]), 4),
            "t2": round(float(pred.at[t, "t2"]), 4),
            "curve": round(float(pred.at[t, "curve"]), 4),
            "wind_100m": None if pd.isna(x.at[t, "ws100"]) else round(float(x.at[t, "ws100"]), 2),
            "actual": None if a is None or pd.isna(a) else round(float(a), 4),
        })
    return rows


@dataclass
class Analysis:
    flags: list[str]
    summary: dict


def analyze(hours: list[dict], weather_info: dict) -> Analysis:
    """Шаг 5. Проверки правдоподобия и сводка. Флаги — повод для внимания диспетчера или пересчёта."""
    df = pd.DataFrame(hours)
    flags = []
    if weather_info["missing_hours"]:
        flags.append(f"В прогнозе погоды нет {weather_info['missing_hours']} ч — значения восстановлены по соседним часам")
    width = float((df["p90"] - df["p10"]).mean())
    if width > WIDE_MEAN:
        flags.append(f"Высокая неопределённость: средняя ширина интервала p10–p90 = {width:.2f}")
    if weather_info["wind_100m_max"] and weather_info["wind_100m_max"] > 20:
        flags.append(f"Сильный ветер до {weather_info['wind_100m_max']} м/с — риск остановки турбин по защите")
    gap = float((df["p50"] - df["curve"]).abs().mean())
    if gap > 0.15:
        flags.append(f"Модель заметно расходится с кривой мощности (в среднем {gap:.2f}) — проверить входные данные")
    d1 = df[df["lead_day"] == 1]
    d2 = df[df["lead_day"] == 2]
    summary = {
        "energy_d1": round(float(d1["p50"].sum()), 2),  # в «часах работы на полную мощность»
        "energy_d2": round(float(d2["p50"].sum()), 2),
        "peak_hour": df.loc[df["p50"].idxmax(), "time"],
        "low_hours": int((df["p50"] < LOW).sum()),
        "interval_width": round(width, 3),
    }
    return Analysis(flags=flags, summary=summary)


def compare_with_previous(issue_date: str, hours: list[dict]) -> dict:
    """Шаг 6. Пересчёт при обновлении входа: сутки D+1 уже прогнозировались вчера как D+2 (по более старому выпуску
    погоды). Сравниваем новый прогноз со старым — это и есть обновление прогноза при появлении свежих данных."""
    d = pd.Timestamp(issue_date).normalize()
    prev_issue = (d - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    _, d1, _ = issue_window(issue_date)
    old_leads = model.run_lead(d1, model.issue_moment(d - pd.Timedelta(days=1)))
    x_old = model.features_at(d1, old_leads).interpolate(limit=3, limit_direction="both")
    old = run_model(x_old)["p50"]
    new = pd.Series({pd.Timestamp(h["time"]): h["p50"] for h in hours if h["lead_day"] == 1})
    diff = (new - old.reindex(new.index)).abs()
    return {
        "previous_issue": prev_issue,
        "day": d1[0].strftime("%Y-%m-%d"),
        "mean_abs_change": round(float(diff.mean()), 4),
        "max_abs_change": round(float(diff.max()), 4),
        "energy_old": round(float(old.sum()), 2),
        "energy_new": round(float(new.sum()), 2),
        "significant": bool(diff.mean() > 0.05),
    }


def full_cycle(issue_date: str) -> dict:
    """Весь цикл без агента — для ретроспективного прогона и как эталон для проверки агента."""
    check_issue_date(issue_date)
    w = get_weather(issue_date)
    x = prepare(issue_date)
    pred = run_model(x)
    hours = hourly_forecast(issue_date, x, pred)
    a = analyze(hours, w)
    cmp = compare_with_previous(issue_date, hours)
    return {"issue_date": issue_date, "weather": w, "hours": hours, "summary": a.summary, "flags": a.flags, "update": cmp}


def energy_share(values: list[float]) -> float:
    return round(float(np.mean(values)), 4) if values else 0.0
