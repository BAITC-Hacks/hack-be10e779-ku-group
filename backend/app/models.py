"""ORM-модели. Таблицы создаются при старте (`init_db`)."""

from datetime import UTC, datetime

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class Station(Base):
    __tablename__ = "stations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    region: Mapped[str] = mapped_column(String(100), default="")
    is_case: Mapped[bool] = mapped_column(Boolean, default=False)
    model_status: Mapped[str] = mapped_column(String(200), default="")
    created_by: Mapped[str] = mapped_column(String(50), default="system")
    created_at: Mapped[str] = mapped_column(String(40), default=_now)
    turbines: Mapped[list["Turbine"]] = relationship(back_populates="station", cascade="all, delete-orphan")


class Turbine(Base):
    __tablename__ = "turbines"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"))
    name: Mapped[str] = mapped_column(String(50))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    history_rows: Mapped[int] = mapped_column(Integer, default=0)
    history_start: Mapped[str] = mapped_column(String(40), default="")
    history_end: Mapped[str] = mapped_column(String(40), default="")
    history_file: Mapped[str] = mapped_column(String(200), default="")
    station: Mapped[Station] = relationship(back_populates="turbines")
