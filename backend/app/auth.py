"""Авторизация и роли. Токен — HMAC-подпись (без внешних зависимостей), срок 12 ч.

Роли по возрастанию прав: dispatcher (прогноз) → analyst (+ прогоны февраля, автономный прогон) → admin (+ станции,
турбины, загрузка истории). Чтение (GET) открыто. Учётки задаются AUTH_USERS «логин:пароль:роль,…»; тестовые — в README
(п. 5.6.6 положения: проверка без личных аккаунтов участников). В продакшене — сменить AUTH_SECRET и пароли.
"""

import base64
import hashlib
import hmac
import json
import time

from fastapi import Depends, Header, HTTPException

from app.config import settings

ROLES = {"dispatcher": 1, "analyst": 2, "admin": 3}
TTL_S = 12 * 3600


def _users() -> dict[str, tuple[str, str]]:
    out = {}
    for item in settings.auth_users.split(","):
        parts = item.strip().split(":")
        if len(parts) == 3 and parts[2] in ROLES:
            out[parts[0]] = (parts[1], parts[2])
    return out


def _sign(payload: bytes) -> str:
    return hmac.new(settings.auth_secret.encode(), payload, hashlib.sha256).hexdigest()


def issue_token(username: str, password: str) -> dict:
    user = _users().get(username)
    if not user or not hmac.compare_digest(user[0], password):
        raise HTTPException(401, "Неверный логин или пароль")
    body = json.dumps({"u": username, "r": user[1], "exp": int(time.time()) + TTL_S}).encode()
    token = base64.urlsafe_b64encode(body).decode() + "." + _sign(body)
    return {"token": token, "user": {"username": username, "role": user[1]}, "expires_in": TTL_S}


def decode(token: str) -> dict:
    try:
        b64, sig = token.split(".", 1)
        body = base64.urlsafe_b64decode(b64.encode())
    except Exception as exc:
        raise HTTPException(401, "Неверный токен") from exc
    if not hmac.compare_digest(_sign(body), sig):
        raise HTTPException(401, "Неверный токен")
    data = json.loads(body)
    if data["exp"] < time.time():
        raise HTTPException(401, "Сессия истекла — войдите снова")
    return {"username": data["u"], "role": data["r"]}


def current_user(authorization: str | None = Header(default=None)) -> dict | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return decode(authorization.split(" ", 1)[1])


def require(role: str):
    """Зависимость FastAPI: пускает пользователя с ролью не ниже `role`. AUTH_REQUIRED=0 — проверка отключена."""

    def dep(user: dict | None = Depends(current_user)) -> dict:
        if not settings.auth_required:
            return user or {"username": "anonymous", "role": "admin"}
        if user is None:
            raise HTTPException(401, "Нужен вход: POST /api/auth/login")
        if ROLES[user["role"]] < ROLES[role]:
            raise HTTPException(403, f"Недостаточно прав: нужна роль «{role}» или выше")
        return user

    return dep
