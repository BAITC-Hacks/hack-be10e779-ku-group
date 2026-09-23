"""API прогноза ВЭС: /api/forecast, /api/backtest, /api/metrics, /api/history (docs/api-contract.md).

Большинство тестов подменяет agent.run / pipeline.full_cycle — быстро и без записи файлов в outputs/.
test_forecast_real_agent прогоняет настоящего агента в DEMO (первый вызов обучает модель, ~1 мин).
"""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api import forecast as api
from app.forecast import agent, pipeline
from app.main import app

client = TestClient(app, raise_server_exceptions=False)


def fake_cycle(issue_date: str) -> dict:
    pipeline.check_issue_date(issue_date)  # та же проверка даты, что в настоящем цикле
    d = issue_date
    hours = [
        {
            "time": f"2026-02-{10 + i // 24:02d}T{i % 24:02d}:00",
            "lead_day": 1 + i // 24,
            "p50": 0.3,
            "p10": 0.1,
            "p90": 0.5,
            "t1": 0.31,
            "t2": 0.29,
            "curve": 0.28,
            "wind_100m": 7.5,
            "actual": None,
        }
        for i in range(48)
    ]
    return {
        "issue_date": d,
        "weather": {
            "source": "Open-Meteo Previous Runs API (best_match)",
            "runs": "D+1 ≈ за 24 ч, D+2 ≈ за 48 ч",
            "hours": 48,
            "missing_hours": 0,
            "wind_100m_mean": 7.5,
            "wind_100m_max": 9.0,
        },
        "hours": hours,
        "summary": {
            "energy_d1": 7.2,
            "energy_d2": 7.2,
            "peak_hour": "2026-02-10T00:00",
            "low_hours": 0,
            "interval_width": 0.4,
        },
        "flags": ["Высокая неопределённость"],
        "update": {
            "previous_issue": "2026-02-08",
            "day": "2026-02-10",
            "mean_abs_change": 0.05,
            "max_abs_change": 0.2,
            "energy_old": 7.0,
            "energy_new": 7.2,
            "significant": False,
        },
    }


def fake_agent(issue_date: str) -> dict:
    res = fake_cycle(issue_date)
    return {
        "issue_date": issue_date,
        "issued_at": f"{issue_date}T23:59",
        "weather_source": res["weather"]["source"],
        "weather_runs": res["weather"]["runs"],
        "time_integrity": {"issued_at": f"{issue_date} 23:59:00", "ok": True, "rule": "выпуск до момента прогноза"},
        "excluded_sources": ["gfs_ws100"],
        "hours": res["hours"],
        "summary": res["summary"],
        "analysis": {"flags": res["flags"], "changed_vs_previous": 0.05, "update": res["update"]},
        "explanation": "Объяснение планировщика",
        "mode": "demo",
        "steps": [
            {"type": "tool", "name": n, "arguments": "{}", "output": "{}", "ok": True, "ms": 5}
            for n in (
                "rank_weather_sources",
                "fetch_weather",
                "build_features",
                "run_forecast",
                "analyze_forecast",
                "compare_with_previous",
            )
        ],
    }


@pytest.fixture
def fake(monkeypatch):
    monkeypatch.setattr(agent, "run", fake_agent)
    monkeypatch.setattr(pipeline, "full_cycle", fake_cycle)
    calls = []
    monkeypatch.setattr(api.cli, "backtest", lambda *a: calls.append(a))
    return calls


# --- /api/forecast ---


def test_forecast_returns_agent_result(fake):
    r = client.post("/api/forecast", json={"issue_date": "2026-02-09"})
    assert r.status_code == 200
    f = r.json()
    assert f["issue_date"] == "2026-02-09" and f["issued_at"] == "2026-02-09T23:59"
    assert f["mode"] == "demo" and f["explanation"] == "Объяснение планировщика"
    assert len(f["hours"]) == 48 and {h["lead_day"] for h in f["hours"]} == {1, 2}
    assert f["time_integrity"]["ok"] is True and f["excluded_sources"] == ["gfs_ws100"]
    assert f["analysis"]["changed_vs_previous"] == 0.05 and f["analysis"]["update"]["day"] == "2026-02-10"
    assert [s["name"] for s in f["steps"]][:2] == ["rank_weather_sources", "fetch_weather"]


@pytest.mark.parametrize("bad", ["2026-03-01", "2026-01-30", "abc"])
def test_forecast_bad_date_is_400(fake, bad):
    r = client.post("/api/forecast", json={"issue_date": bad})
    assert r.status_code == 400 and "Дата прогноза" in r.json()["detail"]


def test_forecast_without_body_is_422():
    assert client.post("/api/forecast", json={}).status_code == 422


def test_forecast_weather_unavailable_is_503(monkeypatch):
    def boom(_):
        raise httpx.ConnectError("нет сети")

    monkeypatch.setattr(agent, "run", boom)
    r = client.post("/api/forecast", json={"issue_date": "2026-02-09"})
    assert r.status_code == 503 and "погоды" in r.json()["detail"]


def test_forecast_internal_error_is_500_without_details(monkeypatch):
    def boom(_):
        raise KeyError("секрет")

    monkeypatch.setattr(agent, "run", boom)
    r = client.post("/api/forecast", json={"issue_date": "2026-02-09"})
    assert r.status_code == 500 and "секрет" not in r.text


def test_forecast_real_agent():
    """Настоящий агент в DEMO (conftest убирает ключ): полный цикл, шаги с временем, проверка честности по времени."""
    r = client.post("/api/forecast", json={"issue_date": "2026-02-09"})
    assert r.status_code == 200, r.text
    f = r.json()
    assert f["mode"] == "demo"
    assert len(f["hours"]) == 48
    assert all(0 <= h["p10"] <= h["p50"] <= h["p90"] <= 1 for h in f["hours"])
    assert f["hours"][0]["time"] == "2026-02-10T00:00" and f["hours"][-1]["time"] == "2026-02-11T23:00"
    assert f["time_integrity"]["ok"] is True
    names = [s["name"] for s in f["steps"] if s["type"] == "tool"]
    assert {"fetch_weather", "run_forecast", "analyze_forecast", "compare_with_previous"} <= set(names)
    assert all(s["ms"] >= 0 for s in f["steps"]) and f["explanation"]


# --- прогрев и /health ---


def test_warm_up_states(monkeypatch):
    monkeypatch.setattr(api, "warm", {"state": "cold"})
    monkeypatch.setattr(api.model, "get_forecaster", lambda: None)
    monkeypatch.setattr(api.calibrate, "load", lambda: {})
    api.warm_up()
    assert api.warm["state"] == "ready"
    assert client.get("/health").json()["model"] == "ready"


def test_warm_up_failure_is_reported(monkeypatch):
    def boom():
        raise RuntimeError("нет данных")

    monkeypatch.setattr(api, "warm", {"state": "cold"})
    monkeypatch.setattr(api.model, "get_forecaster", boom)
    api.warm_up()
    assert api.warm["state"] == "error"
    assert client.get("/health").json() == {**client.get("/health").json(), "status": "ok", "model": "error"}


# --- /api/backtest ---


def test_backtest_partial_does_not_write_file(fake):
    r = client.post("/api/backtest", json={"start": "2026-02-01", "end": "2026-02-03"})
    assert r.status_code == 200
    b = r.json()
    assert b["runs"] == 3 and b["file"] is None
    assert [x["issue_date"] for x in b["forecasts"]] == ["2026-02-01", "2026-02-02", "2026-02-03"]
    assert fake == []  # общий CSV не перезаписан


def test_backtest_full_period_writes_file(fake):
    r = client.post("/api/backtest", json={})
    assert r.status_code == 200
    b = r.json()
    assert b["runs"] == 28 and b["file"] == "outputs/forecast_feb2026.csv"
    assert fake == [("2026-01-31", "2026-02-27")]


@pytest.mark.parametrize(
    "body", [{"start": "2026-02-05", "end": "2026-02-01"}, {"start": "2026-01-01", "end": "2026-02-01"}]
)
def test_backtest_bad_range_is_400(fake, body):
    assert client.post("/api/backtest", json=body).status_code == 400


# --- /api/metrics ---


def test_metrics_from_file(tmp_path, monkeypatch):
    f = tmp_path / "metrics.json"
    f.write_text(json.dumps({"holdout": "2026-01", "rows": [{"model": "m", "lead": "D+1", "mae": 0.1}]}))
    monkeypatch.setattr(api, "METRICS_FILE", f)
    r = client.get("/api/metrics")
    assert r.status_code == 200 and r.json()["rows"][0]["mae"] == 0.1


def test_metrics_computed_when_no_file(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "METRICS_FILE", tmp_path / "нет.json")
    monkeypatch.setattr(
        api.model, "holdout_metrics", lambda: {"holdout": "x", "rows": [{"model": "m", "coverage": 0.7}]}
    )
    r = client.get("/api/metrics")
    assert r.status_code == 200 and r.json()["rows"][0]["coverage"] == 0.7


def test_metrics_repo_file_matches_schema():
    if not api.METRICS_FILE.is_file():
        pytest.skip("outputs/metrics.json ещё не создан")
    r = client.get("/api/metrics")
    assert r.status_code == 200 and r.json()["rows"]


# --- /api/history ---


def test_history_two_days():
    r = client.get("/api/history", params={"start": "2026-01-30", "end": "2026-01-31"})
    assert r.status_code == 200
    pts = r.json()["points"]
    assert len(pts) == 48
    assert pts[0]["time"] == "2026-01-30T00:00" and pts[-1]["time"] == "2026-01-31T23:00"
    assert all(p["actual"] is None or 0 <= p["actual"] <= 1 for p in pts)


def test_history_gap_hours_are_null():
    # у турбины 1 нет данных в июне 2024 → мощность станции неизвестна
    r = client.get("/api/history", params={"start": "2024-06-10", "end": "2024-06-10"})
    assert r.status_code == 200 and all(p["actual"] is None for p in r.json()["points"])


@pytest.mark.parametrize(
    "params",
    [
        {"start": "30.01.2026", "end": "2026-01-31"},
        {"start": "2026-01-31", "end": "2026-01-30"},
        {"start": "2026-03-01", "end": "2026-03-02"},
        {"start": "2025-01-01", "end": "2025-12-31"},
    ],
)
def test_history_bad_params_are_400(params):
    r = client.get("/api/history", params=params)
    assert r.status_code == 400 and r.json()["detail"]
