"""Паспорт прогноза и неизменяемые версии выпусков.

Каждый завершённый выпуск сохраняется в outputs/forecasts/<forecast_id>.json вместе с паспортом: какие входы использованы
(выпуски погоды по часам, источники, исключённые источники), версии модели и калибровки, граница данных, статус проверки
времени, хеши входов и результата. Версия не перезаписывается: тот же вход → тот же forecast_id и тот же результат.
Сравнение с прошлым выпуском идёт по СОХРАНЁННЫМ версиям (а не пересчётом прошлого текущей моделью).
"""

import hashlib
import json
from datetime import UTC, datetime

import pandas as pd

from app.config import ROOT_DIR
from app.forecast import calibrate, model, weather

STORE = ROOT_DIR / "outputs" / "forecasts"
TZ_OFFSET = "+05:00"  # «статистическое время» — UTC+5, подтверждено организаторами
REVISION_PP = 0.10  # существенный пересмотр — от 10 п.п. номинала
WIDE_INTERVAL = 0.30  # широкий интервал p10–p90
TEST_END = pd.Timestamp("2026-02-28 23:00")


def _jsonable(o):
    return o.item() if hasattr(o, "item") else str(o)


def _hash(obj) -> str:
    return hashlib.sha256(json.dumps(obj, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()


def model_id() -> str:
    f = model.get_forecaster()
    return "hgb-q-" + _hash({"features": model.FEATURES, "until": str(f.trained_until), "n": f.n_train})[:10]


def calibration_id() -> str:
    return "cqr-" + _hash(calibrate.load())[:10]


def _iso(ts: pd.Timestamp) -> str:
    return ts.strftime("%Y-%m-%dT%H:%M:%S") + TZ_OFFSET


def build(issue_date: str, x: pd.DataFrame, hours: list[dict], weather_info: dict, excluded: list[str],
          mode: str, steps: list[dict]) -> dict:
    issued_at = model.issue_moment(pd.Timestamp(issue_date))
    inputs = {
        "issue_date": issue_date,
        "leads_by_hour": weather_info.get("leads_by_hour"),
        "excluded_sources": sorted(excluded),
        "features": x[model.FEATURES].round(4).astype(object).where(x[model.FEATURES].notna(), None).values.tolist(),
        "model_id": model_id(),
        "calibration_id": calibration_id(),
        # режим — часть версии: LIVE-выпуск (решения LLM) хранится отдельно от прогона планировщика
        "execution_mode": "llm" if mode == "live" else "deterministic",
    }
    input_hash = _hash(inputs)
    result = [[h["time"], h["p10"], h["p50"], h["p90"]] for h in hours]
    ti = weather_info.get("time_integrity", {})
    return {
        "forecast_id": f"{issue_date}_{input_hash[:8]}",
        "parent_id": None,
        "decision_at": _iso(issued_at),
        "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "target_start": _iso(pd.Timestamp(hours[0]["time"])),
        "target_end": _iso(pd.Timestamp(hours[-1]["time"])),
        "weather_profile": {
            "endpoint": weather.URL, "models": ["best_match", *weather.ENSEMBLE], "archive": "previous_runs",
            "runs_by_day": {f"выпуск за {n} сут": int(c) for n, c in
                            pd.Series(inputs["leads_by_hour"]).value_counts().sort_index().items()}
            if inputs["leads_by_hour"] else {},
            "publish_delay_h": weather.PUBLISH_DELAY_H, "local_archive": "data/weather/",
        },
        "as_of_status": "verified_by_rule" if ti.get("ok") else "rejected",
        "as_of_basis": ti.get("rule"),
        "effective_sources": [s for s in ["best_match", *weather.ENSEMBLE] if s not in excluded],
        "excluded_sources": sorted(excluded),
        "data_cutoff": _iso(min(issued_at, model.TRAIN_END)),
        "training_end": _iso(model.get_forecaster().trained_until),
        "calibration_end": "2025-12-31T23:00:00" + TZ_OFFSET,
        "model_id": inputs["model_id"],
        "calibration_id": inputs["calibration_id"],
        "input_hash": input_hash,
        "result_hash": _hash(result),
        "execution_mode": "llm" if mode == "live" else "deterministic",
        "hours_outside_test_period": int(sum(pd.Timestamp(h["time"]) > TEST_END for h in hours)),
    }


def save(passport: dict, forecast: dict) -> dict:
    """Сохранить выпуск, если такой версии ещё нет. Возвращает паспорт (с parent_id)."""
    STORE.mkdir(parents=True, exist_ok=True)
    path = STORE / f"{passport['forecast_id']}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))["passport"]
    prev = latest(str((pd.Timestamp(passport["decision_at"][:10]) - pd.Timedelta(days=1)).date()))
    passport["parent_id"] = prev["passport"]["forecast_id"] if prev else None
    path.write_text(json.dumps({"passport": passport, "forecast": forecast}, ensure_ascii=False, indent=1,
                               default=_jsonable), encoding="utf-8")
    return passport


def latest(issue_date: str) -> dict | None:
    files = sorted(STORE.glob(f"{issue_date}_*.json"), key=lambda p: p.stat().st_mtime)
    return json.loads(files[-1].read_text(encoding="utf-8")) if files else None


def load(forecast_id: str) -> dict | None:
    path = STORE / f"{forecast_id}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def compare(previous: dict, current_hours: list[dict]) -> dict:
    """Сравнение сохранённого прошлого выпуска с текущим по общим часам (у прошлого это D+2, у текущего — D+1)."""
    old = {h["time"]: h["p50"] for h in previous["forecast"]["hours"]}
    common = [(h["time"], old[h["time"]], h["p50"]) for h in current_hours if h["time"] in old]
    if not common:
        return {"previous_id": previous["passport"]["forecast_id"], "common_hours": 0}
    d = pd.DataFrame(common, columns=["time", "old", "new"])
    d["delta"] = d["new"] - d["old"]
    big = d[d["delta"].abs() >= REVISION_PP]
    return {
        "previous_id": previous["passport"]["forecast_id"],
        "previous_issue": previous["passport"]["decision_at"][:10],
        "day": d["time"].iloc[0][:10],
        "common_hours": len(d),
        "mean_abs_change": round(float(d["delta"].abs().mean()), 4),
        "max_abs_change": round(float(d["delta"].abs().max()), 4),
        "energy_old": round(float(d["old"].sum()), 2),
        "energy_new": round(float(d["new"].sum()), 2),
        "hours_changed_10pp": int(len(big)),
        "changed_hours": big["time"].tolist(),
        "significant": bool(len(big) >= 3),
        "method": "сравнение сохранённых версий",
    }


def cards(hours: list[dict], update: dict | None, weather_info: dict, excluded: list[str]) -> list[dict]:
    """Карточки внимания диспетчера (E3). Пороги — демонстрационные настройки команды."""
    out = []
    if update and update.get("hours_changed_10pp"):
        ch = update["changed_hours"]
        out.append({"kind": "revision", "title": "Существенный пересмотр",
                    "hours": [ch[0], ch[-1]], "value": update["hours_changed_10pp"],
                    "text": f"{update['hours_changed_10pp']} из {update['common_hours']} ч изменились на ≥10 п.п. "
                            f"относительно выпуска {update['previous_issue']}",
                    "rule": "|p50 новый − p50 прошлый| ≥ 0.10", "action": "сверить с планом на эти часы"})
    wide = [h for h in hours if h["p90"] - h["p10"] >= WIDE_INTERVAL]
    if wide:
        out.append({"kind": "wide_interval", "title": "Широкий диапазон",
                    "hours": [wide[0]["time"], wide[-1]["time"]], "value": len(wide),
                    "text": f"{len(wide)} ч с интервалом p10–p90 шире 30 п.п. (калиброванный интервал)",
                    "rule": "p90 − p10 ≥ 0.30", "action": "держать резерв на эти часы"})
    problems = []
    if not weather_info.get("time_integrity", {}).get("ok", True):
        problems.append("выпуск погоды после момента прогноза")
    if weather_info.get("missing_hours"):
        problems.append(f"нет погоды на {weather_info['missing_hours']} ч")
    # исключение плохого источника — штатное решение агента, а не проблема входа; видно в паспорте
    if problems:
        out.append({"kind": "input", "title": "Ненадёжный вход", "hours": [hours[0]["time"], hours[-1]["time"]],
                    "value": len(problems), "text": "; ".join(problems), "rule": "проверки входа",
                    "action": "проверить паспорт выпуска"})
    return out
