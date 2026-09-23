"""Новые станции: месяцы дописываются к истории, кривая мощности пересчитывается автоматически, без истории прогноза нет."""

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.config import ROOT_DIR
from app.main import app


@pytest.fixture
def client(monkeypatch, tmp_path):
    import app.api.station_model as sm
    import app.api.stations as st

    monkeypatch.setattr(st, "UPLOADS", tmp_path)
    monkeypatch.setattr(sm, "UPLOADS", tmp_path)
    with TestClient(app) as c:
        yield c


def _month_csv(ym: str) -> bytes:
    df = pd.read_csv(ROOT_DIR / "data" / "raw" / "turbine1.csv")
    t = pd.to_datetime(df.iloc[:, 1])
    return df[t.dt.strftime("%Y-%m") == ym].to_csv(index=False).encode("utf-8")


def test_months_append_and_curve_refits(client):
    sid = client.post("/api/stations", json={"name": "Тест", "latitude": 43.6, "longitude": 78.5}).json()["id"]
    assert client.post(f"/api/stations/{sid}/forecast", json={}).status_code == 409  # без истории прогноза нет
    tid = client.post(f"/api/stations/{sid}/turbines", json={"name": "Т1", "latitude": 43.6, "longitude": 78.5}).json()[
        "turbines"
    ][0]["id"]

    r1 = client.post(f"/api/turbines/{tid}/history/months", files=[("files", ("dec.csv", _month_csv("2025-12")))])
    assert r1.status_code == 200, r1.text
    h1 = client.get(f"/api/stations/{sid}/curve").json()["hours"]

    r2 = client.post(f"/api/turbines/{tid}/history/months", files=[("files", ("jan.csv", _month_csv("2026-01")))])
    assert r2.status_code == 200, r2.text
    assert r2.json()["total_rows"] > r1.json()["total_rows"]  # январь дописан к декабрю
    curve = client.get(f"/api/stations/{sid}/curve").json()
    assert curve["hours"] > h1  # модель пересчитана по всей истории
    p50 = [p["p50"] for p in curve["points"]]
    assert p50 == sorted(p50) and 0 <= p50[0] and p50[-1] <= 1  # кривая не убывает и в пределах 0–1

    rep = r2.json()["files"][0]
    assert rep["step_min"] == 10 and rep["hours"] > 700 and rep["power_out_of_range"] == 0
    cov = client.get(f"/api/turbines/{tid}/history/coverage").json()["coverage"]
    assert [c["month"] for c in cov] == ["2025-12", "2026-01"] and all(c["expected"] == 744 for c in cov)

    # повторная загрузка того же месяца не удваивает историю
    r3 = client.post(f"/api/turbines/{tid}/history/months", files=[("files", ("jan.csv", _month_csv("2026-01")))])
    assert r3.json()["total_rows"] == r2.json()["total_rows"]
