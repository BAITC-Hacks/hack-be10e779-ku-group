"""API прогноза ВЭС: /api/forecast, /api/backtest, /api/metrics, /api/history (docs/api-contract.md).

Большинство тестов подменяет agent.run / pipeline.full_cycle — быстро и без записи файлов в outputs/.
test_forecast_real_agent прогоняет настоящего агента в DEMO (первый вызов обучает модель, ~1 мин).
"""

import json

import httpx
import pandas as pd
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
            "weather_run_days": 1 + i // 24,
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


# --- /api/backtest (POST) ---


def test_backtest_post_full_period_runs_cli_and_returns_backtest(fake, store):
    save_issue(store, "2026-02-01")
    r = client.post("/api/backtest", json={})
    assert r.status_code == 200
    assert fake == [("2026-01-31", "2026-02-27")]
    assert r.json()["runs"] == 1 and r.json()["forecasts"][0]["issue_date"] == "2026-02-01"


@pytest.mark.parametrize(
    "body",
    [
        {"start": "2026-02-01", "end": "2026-02-03"},
        {"start": "2026-02-05", "end": "2026-02-01"},
        {"start": "2026-01-01", "end": "2026-02-27"},
    ],
)
def test_backtest_post_partial_or_bad_is_400(fake, store, body):
    assert client.post("/api/backtest", json=body).status_code == 400
    assert fake == []


def test_backtest_post_while_running_is_409(fake, store):
    assert api._backtest_lock.acquire(blocking=False)
    try:
        r = client.post("/api/backtest", json={})
        assert r.status_code == 409 and r.json()["detail"] == "Прогон уже идёт"
    finally:
        api._backtest_lock.release()


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


# --- v2: сохранённые выпуски (outputs/forecasts), meta, бэктест, CSV, holdout ---

BT_COLS = "issue_date,issued_at,forecast_id,outside_test_period,time,lead_day,weather_run_days,p50,p10,p90,t1,t2,curve"


def save_issue(store, issue: str, suffix: str = "aaaa0000", created: str = "2026-09-23T10:00:00+00:00") -> dict:
    f = fake_agent(issue)
    f["cards"] = [
        {
            "kind": "wide_interval",
            "title": "Широкий диапазон",
            "hours": ["2026-02-10T00:00", "2026-02-10T05:00"],
            "value": 6,
            "text": "6 ч",
            "rule": "p90 − p10 ≥ 0.30",
            "action": "держать резерв",
        }
    ]
    pas = {"forecast_id": f"{issue}_{suffix}", "created_at": created, "as_of_status": "verified_by_rule"}
    (store / f"{issue}_{suffix}.json").write_text(json.dumps({"passport": pas, "forecast": f}, ensure_ascii=False))
    return pas


@pytest.fixture
def store(tmp_path, monkeypatch):
    d = tmp_path / "forecasts"
    d.mkdir()
    monkeypatch.setattr(api.passport, "STORE", d)
    return d


@pytest.fixture
def csvs(tmp_path, monkeypatch):
    all_csv, final_csv = tmp_path / "all.csv", tmp_path / "final.csv"
    all_csv.write_text(
        BT_COLS + "\n2026-01-31,2026-01-31T23:59:00+05:00,x,False,2026-02-01T00:00,1,1,0.1,0,0.2,0,0,0\n"
    )
    final_csv.write_text("time,p50,p10,p90,t1,t2,issue_date,forecast_id\n2026-02-01T00:00,0.1,0,0.2,0,0,2026-01-31,x\n")
    paths = {"all": all_csv, "final": final_csv}
    monkeypatch.setattr(api, "BACKTEST_CSV", paths)
    return paths


def test_saved_forecast_from_store(store):
    save_issue(store, "2026-02-09")
    r = client.get("/api/forecast/2026-02-09")
    assert r.status_code == 200
    f = r.json()
    assert f["passport"]["forecast_id"] == "2026-02-09_aaaa0000" and f["computed_at"] == "2026-09-23T10:00:00+00:00"
    assert f["cards"][0]["kind"] == "wide_interval" and f["hours"][0]["weather_run_days"] == 1
    assert f["explanation"] == "Объяснение планировщика"


def test_saved_forecast_takes_latest_version(store):
    import os

    save_issue(store, "2026-02-09", "old00000", created="old")
    new = save_issue(store, "2026-02-09", "new00000", created="new")
    os.utime(store / "2026-02-09_old00000.json", (1, 1))  # старая версия — раньше по времени файла
    assert client.get("/api/forecast/2026-02-09").json()["passport"]["forecast_id"] == new["forecast_id"]


@pytest.mark.parametrize(
    ("path", "code"),
    [
        ("2026-02-10", 404),  # выпуска нет в хранилище
        ("2026-2-10", 400),
        ("2026-03-10", 400),
        ("....2026-02-09", 400),  # мусор в дате отсекает проверка формата
        ("..%2F..%2Fetc%2Fpasswd", 404),  # «/» ломает маршрут → JSON 404, файл не читается
    ],
)
def test_saved_forecast_errors(store, path, code):
    r = client.get(f"/api/forecast/{path}")
    assert r.status_code == code and r.json()["detail"]


def test_post_forecast_returns_passport_and_cards(fake, monkeypatch):
    def with_passport(d):
        return {**fake_agent(d), "passport": {"forecast_id": f"{d}_x", "created_at": "t"}, "cards": []}

    monkeypatch.setattr(agent, "run", with_passport)
    f = client.post("/api/forecast", json={"issue_date": "2026-02-09"}).json()
    assert f["passport"]["forecast_id"] == "2026-02-09_x" and f["computed_at"] == "t" and f["cards"] == []


def test_meta(store):
    save_issue(store, "2026-02-01")
    save_issue(store, "2026-01-31")
    r = client.get("/api/meta")
    assert r.status_code == 200
    m = r.json()
    assert m["issue_range"] == {"first": "2026-01-31", "last": "2026-02-27"}
    assert [t["id"] for t in m["turbines"]] == ["t1", "t2"] and m["turbines"][0]["lat"] == 43.64515
    assert m["history_range"]["first"].startswith("2023-03-11") and m["history_range"]["last"] == "2026-01-31T23:00"
    assert m["mode"] == "demo" and m["llm_model"] is None
    assert "best_match_ws100" in m["weather_sources"] and "gfs_ws100" in m["weather_sources"]
    assert m["saved_forecasts"] == ["2026-01-31", "2026-02-01"] and isinstance(m["model_ready"], bool)


def test_backtest_from_store(store, csvs):
    save_issue(store, "2026-01-31", created="2026-09-23T09:00:00+00:00")
    save_issue(store, "2026-02-01", created="2026-09-23T09:05:00+00:00")
    r = client.get("/api/backtest")
    assert r.status_code == 200
    b = r.json()
    assert (
        b["runs"] == 2
        and b["file"] == "outputs/forecast_feb2026.csv"
        and b["generated_at"].startswith("2026-09-23T09:05")
    )
    assert b["forecasts"][0] == {
        "issue_date": "2026-01-31",
        "energy_d1": 7.2,
        "energy_d2": 7.2,
        "low_hours": 0,
        "flags": ["Высокая неопределённость"],
    }
    assert len(b["final_hours"]) == 48 and b["final_hours"][0]["issue_date"] == "2026-01-31"


def test_backtest_empty_store_is_404(store, csvs):
    assert client.get("/api/backtest").status_code == 404


def test_backtest_csv_download(csvs):
    r = client.get("/api/backtest/csv", params={"kind": "final"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"] and r.text.startswith("time,p50")
    assert client.get("/api/backtest/csv").text.startswith(BT_COLS)
    assert client.get("/api/backtest/csv", params={"kind": "../../.env"}).status_code == 400


def test_backtest_csv_missing_is_404(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "BACKTEST_CSV", {"all": tmp_path / "нет.csv", "final": tmp_path / "нет2.csv"})
    assert client.get("/api/backtest/csv").status_code == 404


def test_repo_store_and_csv_match_schema():
    if not list(api.passport.STORE.glob("2026-02-09_*.json")):
        pytest.skip("outputs/forecasts ещё не заполнен")
    b = client.get("/api/backtest").json()
    assert b["runs"] == 28 and len(b["final_hours"]) == 28 * 24
    f = client.get("/api/forecast/2026-02-09").json()
    assert len(f["hours"]) == 48 and f["passport"]["forecast_id"].startswith("2026-02-09_")


@pytest.fixture
def holdout_file(tmp_path, monkeypatch):
    rows = ["time,lead_day,p50,p10,p90,curve,actual"]
    for lead in (1, 2):
        for t in pd.date_range("2026-01-01", "2026-01-31 23:00", freq="1h"):
            actual = "" if t.hour == 5 else "0.4"
            rows.append(f"{t:%Y-%m-%dT%H:%M},{lead},0.5,0.2,0.8,0.3,{actual}")
    f = tmp_path / "holdout.csv"
    f.write_text("\n".join(rows), encoding="utf-8")
    monkeypatch.setattr(api, "HOLDOUT_FILE", f)
    return f


def test_holdout(holdout_file):
    r = client.get("/api/holdout", params={"issue_date": "2026-01-20"})
    assert r.status_code == 200
    h = r.json()
    assert len(h["hours"]) == 48
    assert h["hours"][0]["time"] == "2026-01-21T00:00" and h["hours"][0]["lead_day"] == 1
    assert h["hours"][-1]["time"] == "2026-01-22T23:00" and h["hours"][-1]["lead_day"] == 2
    assert h["hours"][5]["actual"] is None
    assert h["mae"] == {"model": 0.1, "curve": 0.1}


@pytest.mark.parametrize("bad", ["2026-01-30", "2025-12-31", "20.01.2026"])
def test_holdout_bad_date_is_400(holdout_file, bad):
    assert client.get("/api/holdout", params={"issue_date": bad}).status_code == 400


def test_holdout_built_once_when_missing(tmp_path, monkeypatch):
    target = tmp_path / "h.csv"
    monkeypatch.setattr(api, "HOLDOUT_FILE", target)
    calls = []

    def fake_build():
        calls.append(1)
        target.write_text("time,lead_day,p50,p10,p90,curve,actual\n2026-01-21T00:00,1,0.5,0.2,0.8,0.3,0.4\n")

    monkeypatch.setattr(api, "build_holdout", fake_build)
    assert client.get("/api/holdout", params={"issue_date": "2026-01-20"}).status_code == 200
    assert client.get("/api/holdout", params={"issue_date": "2026-01-20"}).status_code == 200
    assert calls == [1]
