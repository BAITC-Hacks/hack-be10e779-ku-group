"""Авторизация, станции, турбины и привязка истории.

Станция кейса (2 турбины, Алматинская обл.) создаётся при старте и имеет обученную модель. Администратор может добавить
станцию и турбины и загрузить CSV истории турбины в формате организатора; код проверяет столбцы, период, шаг и пропуски
и привязывает историю к турбине. Обучение модели для новой станции в этой версии не выполняется — статус это показывает.
"""

import io
from datetime import UTC, datetime

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import current_user, issue_token, require
from app.config import ROOT_DIR
from app.db import SessionLocal, get_db
from app.forecast import data
from app.models import Station, Turbine

router = APIRouter(tags=["auth", "stations"])
UPLOADS = ROOT_DIR / "data" / "uploads"
MAX_BYTES = 30 * 1024 * 1024


class LoginIn(BaseModel):
    username: str
    password: str


class StationIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    region: str = Field(default="", max_length=100)


class TurbineIn(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


@router.post("/auth/login")
def login(body: LoginIn) -> dict:
    return issue_token(body.username, body.password)


@router.get("/auth/me")
def me(user: dict | None = Depends(current_user)) -> dict:
    if user is None:
        raise HTTPException(401, "Не выполнен вход")
    return user


def seed_case_station() -> None:
    """Станция кейса — всегда есть, с обученной моделью."""
    with SessionLocal() as db:
        if db.scalar(select(Station).where(Station.is_case)):
            return
        st = Station(name="ВЭС кейса HackAlem (Алматинская обл.)", latitude=data.STATION[0], longitude=data.STATION[1],
                     region="Алматинская обл.", is_case=True, model_status="обучена (история 03.2023–01.2026)")
        db.add(st)
        db.flush()
        h = data.load_hourly()
        for name, (lat, lon) in data.TURBINES.items():
            col = f"{name}_power"
            ok = h[col].dropna()
            db.add(Turbine(station_id=st.id, name=name.upper(), latitude=lat, longitude=lon,
                           history_rows=int(len(ok)), history_start=str(ok.index.min()), history_end=str(ok.index.max()),
                           history_file=f"data/raw/turbine{name[1]}.csv"))
        db.commit()


def _station_out(st: Station) -> dict:
    return {"id": st.id, "name": st.name, "latitude": st.latitude, "longitude": st.longitude, "region": st.region,
            "is_case": st.is_case, "model_status": st.model_status, "created_at": st.created_at,
            "turbines": [{"id": t.id, "name": t.name, "latitude": t.latitude, "longitude": t.longitude,
                          "history_rows": t.history_rows, "history_start": t.history_start,
                          "history_end": t.history_end, "history_file": t.history_file} for t in st.turbines]}


@router.get("/stations")
def list_stations(db: Session = Depends(get_db)) -> list[dict]:
    return [_station_out(s) for s in db.scalars(select(Station).order_by(Station.id))]


@router.post("/stations", status_code=201)
def create_station(body: StationIn, db: Session = Depends(get_db), user: dict = Depends(require("admin"))) -> dict:
    st = Station(name=body.name, latitude=body.latitude, longitude=body.longitude, region=body.region,
                 is_case=False, model_status="нет истории — загрузите CSV турбин", created_by=user["username"])
    db.add(st)
    db.commit()
    db.refresh(st)
    return _station_out(st)


@router.post("/stations/{station_id}/turbines", status_code=201)
def add_turbine(station_id: int, body: TurbineIn, db: Session = Depends(get_db),
                _: dict = Depends(require("admin"))) -> dict:
    st = db.get(Station, station_id)
    if st is None:
        raise HTTPException(404, "Станция не найдена")
    if st.is_case:
        raise HTTPException(400, "Станция кейса фиксирована")
    db.add(Turbine(station_id=st.id, name=body.name, latitude=body.latitude, longitude=body.longitude))
    db.commit()
    db.refresh(st)
    return _station_out(st)


@router.post("/turbines/{turbine_id}/history")
async def upload_history(turbine_id: int, file: UploadFile = File(...), db: Session = Depends(get_db),
                         _: dict = Depends(require("admin"))) -> dict:
    """CSV в формате организатора: «Статистическое время», «Средняя скорость ветра(m/s)»,
    «Нормализованная активная мощность», «Средняя температура окружающей среды(°C)»."""
    t = db.get(Turbine, turbine_id)
    if t is None:
        raise HTTPException(404, "Турбина не найдена")
    st = db.get(Station, t.station_id)
    if st.is_case:
        raise HTTPException(400, "История станции кейса фиксирована")
    raw = await file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "Файл больше 30 МБ")
    try:
        df = pd.read_csv(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(400, "Не удалось прочитать CSV") from exc
    missing = [c for c in data.COLS if c not in df.columns]
    if missing:
        raise HTTPException(400, f"Нет столбцов: {', '.join(missing)}")
    df = df.rename(columns=data.COLS)
    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    bad_time = int(df["time"].isna().sum())
    df = df.dropna(subset=["time"]).sort_values("time")
    if df.empty:
        raise HTTPException(400, "В файле нет строк с корректным временем")
    power_out = int(((df["power"] < 0) | (df["power"] > 1)).sum())
    step = df["time"].diff().mode()
    UPLOADS.mkdir(parents=True, exist_ok=True)
    path = UPLOADS / f"turbine_{t.id}.csv"
    df.to_csv(path, index=False)
    t.history_rows, t.history_start, t.history_end = len(df), str(df["time"].min()), str(df["time"].max())
    t.history_file = str(path.relative_to(ROOT_DIR)) if path.is_relative_to(ROOT_DIR) else path.name
    st.model_status = "история загружена — обучение модели для этой станции не выполнялось в этой версии"
    db.commit()
    return {"turbine_id": t.id, "rows": len(df), "period": [t.history_start, t.history_end],
            "step": str(step.iloc[0]) if len(step) else None, "rows_bad_time": bad_time,
            "power_out_of_range": power_out, "station_status": st.model_status,
            "uploaded_at": datetime.now(UTC).isoformat(timespec="seconds")}
