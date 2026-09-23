"""Авторизация по ролям и станции: чтение открыто, действия — по ролям, CSV истории проверяется и привязывается."""

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "auth_required", True)
    import app.api.stations as st

    monkeypatch.setattr(st, "UPLOADS", tmp_path)
    with TestClient(app) as c:
        yield c


def _token(c, user, pwd):
    r = c.post("/api/auth/login", json={"username": user, "password": pwd})
    assert r.status_code == 200
    return {"Authorization": "Bearer " + r.json()["token"]}


def test_login_and_me(client):
    assert client.post("/api/auth/login", json={"username": "admin", "password": "wrong"}).status_code == 401
    h = _token(client, "analyst", "analyst123")
    assert client.get("/api/auth/me", headers=h).json() == {"username": "analyst", "role": "analyst"}
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer abc.def"}).status_code == 401


def test_actions_need_role_but_reading_is_open(client):
    assert client.get("/api/stations").status_code == 200
    assert client.post("/api/forecast", json={"issue_date": "2026-02-09"}).status_code == 401
    disp = _token(client, "dispatcher", "dispatcher123")
    assert client.post("/api/autonomous-run", json={}, headers=disp).status_code == 403
    assert client.post("/api/stations", json={"name": "ВЭС-2", "latitude": 43, "longitude": 77}, headers=disp).status_code == 403


def test_case_station_seeded(client):
    s = client.get("/api/stations").json()
    case = [x for x in s if x["is_case"]][0]
    assert len(case["turbines"]) == 2 and case["turbines"][0]["history_rows"] > 20000


def test_admin_adds_station_turbine_and_history(client):
    adm = _token(client, "admin", "admin123")
    st = client.post("/api/stations", json={"name": "Тестовая ВЭС", "latitude": 44.1, "longitude": 76.9}, headers=adm).json()
    st = client.post(f"/api/stations/{st['id']}/turbines", json={"name": "T1", "latitude": 44.1, "longitude": 76.9},
                     headers=adm).json()
    tid = st["turbines"][0]["id"]
    csv = ("ID,Статистическое время,Средняя скорость ветра(m/s),Нормализованная активная мощность,"
           "Средняя температура окружающей среды(°C)\n1,2025-01-01 0:00:00,5.1,0.3,-2\n2,2025-01-01 0:10:00,5.3,0.31,-2\n")
    r = client.post(f"/api/turbines/{tid}/history", files={"file": ("t.csv", csv.encode(), "text/csv")}, headers=adm)
    assert r.status_code == 200 and r.json()["rows"] == 2 and r.json()["step"] == "0 days 00:10:00"
    bad = client.post(f"/api/turbines/{tid}/history", files={"file": ("t.csv", b"a,b\n1,2\n", "text/csv")}, headers=adm)
    assert bad.status_code == 400
