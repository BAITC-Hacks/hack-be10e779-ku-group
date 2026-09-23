"""LLMClient: живой вызов OpenAI API и демо-режим из сохранённых ответов (data/ai-cache/).

live — вызывает API и пополняет кэш; demo (нет ключа) — читает кэш. Промах кэша в demo — честная ошибка
`LLMUnavailable`, а не выдуманный ответ. Запись кэша хранит модель, дату и хеш входа.
Вызывается из ai/agent.py (цикл с инструментами) и из services/* напрямую (`chat`, `complete_json`).
"""

import hashlib
import json
from datetime import UTC, datetime

from pydantic import BaseModel, ValidationError

from app.config import settings


class LLMUnavailable(Exception):
    """Нет ключа и нет сохранённого ответа для этого входа, либо провайдер недоступен."""


class LLMBadOutput(Exception):
    """Модель дважды вернула ответ, не прошедший проверку схемы."""


def _key(model: str, payload: dict) -> str:
    raw = json.dumps({"model": model, **payload}, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()


class LLMClient:
    def __init__(self) -> None:
        self.model = settings.llm_model
        self.cache_dir = settings.ai_cache_dir
        self._client = None
        if settings.live:
            from openai import OpenAI

            self._client = OpenAI(
                api_key=settings.llm_api_key,
                base_url=settings.llm_base_url or None,
                timeout=settings.llm_timeout_s,
                max_retries=1,
            )

    @property
    def mode(self) -> str:
        return "live" if self._client else "demo"

    def chat(self, messages: list[dict], tools: list[dict] | None = None, json_mode: bool = False) -> dict:
        """Один ход модели. Возвращает {"content", "tool_calls": [{"id","name","arguments"}], "model", "source"}."""
        payload = {"messages": messages, "tools": tools, "json_mode": json_mode}
        key = _key(self.model, payload)
        path = self.cache_dir / f"{key}.json"
        if self._client is None:
            if path.exists():
                return {**json.loads(path.read_text(encoding="utf-8")), "source": "cache"}
            raise LLMUnavailable("Демо-режим: для этого входа нет сохранённого ответа модели. Нужен ключ LLM_API_KEY.")

        kwargs: dict = {"model": self.model, "messages": messages}
        if tools:
            kwargs["tools"] = tools
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        try:
            resp = self._client.chat.completions.create(**kwargs)
        except Exception as exc:  # сеть, лимиты, неверный ключ — не роняем приложение
            raise LLMUnavailable(f"Провайдер модели недоступен: {type(exc).__name__}") from exc

        msg = resp.choices[0].message
        record = {
            "content": msg.content or "",
            "tool_calls": [
                {"id": tc.id, "name": tc.function.name, "arguments": tc.function.arguments}
                for tc in (msg.tool_calls or [])
                if tc.type == "function"
            ],
            "model": resp.model,
            "created_at": datetime.now(UTC).isoformat(),
            "input_hash": key,
        }
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        return {**record, "source": "live"}

    def complete_json[T: BaseModel](self, messages: list[dict], schema: type[T]) -> tuple[T, dict]:
        """Ответ по Pydantic-схеме: JSON-режим, проверка, один повтор с текстом ошибки, затем LLMBadOutput."""
        schema_msg = {
            "role": "system",
            "content": "Ответь только JSON-объектом по этой JSON-схеме:\n"
            + json.dumps(schema.model_json_schema(), ensure_ascii=False),
        }
        msgs = [schema_msg, *messages]
        for attempt in range(2):
            raw = self.chat(msgs, json_mode=True)
            try:
                return schema.model_validate_json(raw["content"]), raw
            except ValidationError as exc:
                if attempt == 1:
                    raise LLMBadOutput(f"Ответ модели не прошёл проверку схемы {schema.__name__}") from exc
                msgs = [
                    *msgs,
                    {"role": "assistant", "content": raw["content"]},
                    {"role": "user", "content": f"Ответ не прошёл проверку: {exc.errors()[:3]}. Исправь и верни JSON."},
                ]
        raise AssertionError("unreachable")
