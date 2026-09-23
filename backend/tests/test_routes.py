"""Маршрутизация: API-роутер работает при любом порядке подключения, ошибки — JSON, трассировки наружу нет."""

from fastapi import APIRouter
from fastapi.testclient import TestClient

from app.main import app

router = APIRouter()


@router.get("/_probe")
def probe():
    return {"ok": True}


@router.get("/_crash")
def crash():
    raise RuntimeError("секретная деталь")


app.include_router(router, prefix="/api")  # подключаем уже после создания приложения
client = TestClient(app, raise_server_exceptions=False)


def test_router_included_late_still_works():
    assert client.get("/api/_probe").json() == {"ok": True}


def test_unknown_api_is_json_404():
    r = client.get("/api/nope")
    assert r.status_code == 404 and r.json() == {"detail": "Не найдено"}


def test_crash_is_json_500_without_details():
    r = client.get("/api/_crash")
    assert r.status_code == 500 and "секретная" not in r.text


def test_wrong_method_is_405():
    r = client.post("/api/_probe")
    assert r.status_code == 405
