"""Точка входа FastAPI: /health, роутеры /api/*, раздача собранного frontend (один контейнер, один порт)."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.ai.llm import LLMBadOutput, LLMClient, LLMUnavailable
from app.api import forecast as forecast_api
from app.config import settings
from app.db import init_db
from app.schemas import Health


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="KU group", lifespan=lifespan)


log = logging.getLogger("app")


@app.exception_handler(LLMUnavailable)
async def llm_unavailable(_: Request, exc: LLMUnavailable):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(LLMBadOutput)
async def llm_bad_output(_: Request, exc: LLMBadOutput):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    # трассировка — только в лог сервера, наружу — понятное сообщение
    log.exception("Необработанная ошибка: %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Внутренняя ошибка сервера"})


@app.get("/health", response_model=Health)
def health() -> Health:
    return Health(status="ok", mode=LLMClient().mode, commit=settings.build_commit)


# роутеры подключаются здесь: app.include_router(<router>, prefix="/api")
app.include_router(forecast_api.router, prefix="/api")


@app.exception_handler(StarletteHTTPException)
async def not_found_or_spa(request: Request, exc: StarletteHTTPException):
    """Фронтенд отдаётся на 404 для GET вне /api — не зависит от порядка подключения роутеров."""
    static = settings.static_dir.resolve()
    path = request.url.path.lstrip("/")
    if exc.status_code == 404 and request.method == "GET" and not path.startswith("api/") and static.is_dir():
        file = (static / path).resolve()
        if path and file.is_file() and file.is_relative_to(static):
            return FileResponse(file)
        if (static / "index.html").is_file():
            return FileResponse(static / "index.html")
    detail = exc.detail if exc.status_code != 404 else "Не найдено"
    return JSONResponse(status_code=exc.status_code, content={"detail": detail}, headers=exc.headers)
