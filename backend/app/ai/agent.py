"""Агентный цикл: модель вызывает инструменты (function calling), код их исполняет, всё пишется в журнал шагов.

Инструменты — обычные функции с Pydantic-моделью аргументов, регистрируются `@tool`. Они работают кодом и в демо-режиме:
из кэша берутся только ходы модели. Ошибка инструмента возвращается модели текстом, а не роняет запуск.
Для демо-режима вывод инструментов должен быть детерминированным (без текущего времени, uuid, случайности):
он входит в ключ кэша следующего хода модели, иначе сохранённый ответ не найдётся.
Инструменты с `mutating=True` не исполняются агентом — возвращаются в `pending_actions` на подтверждение пользователю.
"""

import json
import time
from collections.abc import Callable
from dataclasses import dataclass, field

from pydantic import BaseModel, ValidationError

from app.ai.llm import LLMClient

MAX_STEPS = 8
DEADLINE_S = 90.0


@dataclass
class Tool:
    name: str
    description: str
    args: type[BaseModel]
    fn: Callable[[BaseModel], object]
    mutating: bool = False

    def spec(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.args.model_json_schema(),
            },
        }


def tool(description: str, args: type[BaseModel], mutating: bool = False):
    """Декоратор: превращает функцию `fn(args) -> JSON-совместимое` в инструмент агента."""

    def wrap(fn: Callable) -> Tool:
        return Tool(name=fn.__name__, description=description, args=args, fn=fn, mutating=mutating)

    return wrap


@dataclass
class AgentResult:
    answer: str
    steps: list[dict] = field(default_factory=list)
    pending_actions: list[dict] = field(default_factory=list)
    source: str = "live"  # live | cache — показывается в UI
    stopped: str = "done"  # done | max_steps | deadline


def _run_tool(t: Tool, arguments: str) -> tuple[str, bool]:
    try:
        args = t.args.model_validate_json(arguments or "{}")
        return json.dumps(t.fn(args), ensure_ascii=False, default=str), True
    except ValidationError as exc:
        return f"Ошибка аргументов: {exc.errors()[:3]}", False
    except Exception as exc:  # инструмент не должен ронять агента
        return f"Ошибка инструмента: {type(exc).__name__}: {exc}", False


def run_agent(
    system: str, user: str, tools: list[Tool], llm: LLMClient | None = None, on_step: Callable | None = None
) -> AgentResult:
    """Системная инструкция + пользовательский ввод (данные, не инструкции) → ответ и журнал шагов."""
    llm = llm or LLMClient()
    by_name = {t.name: t for t in tools}
    specs = [t.spec() for t in tools] or None
    messages: list[dict] = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    result = AgentResult(answer="")
    started = time.monotonic()
    sources: set[str] = set()

    for _ in range(MAX_STEPS):
        if time.monotonic() - started > DEADLINE_S:
            result.stopped = "deadline"
            break
        t0 = time.monotonic()
        turn = llm.chat(messages, tools=specs)
        sources.add(turn["source"])
        result.steps.append(
            {
                "type": "model",
                "content": turn["content"],
                "tool_calls": [c["name"] for c in turn["tool_calls"]],
                "source": turn["source"],
                "ms": round((time.monotonic() - t0) * 1000),
            }
        )
        if on_step:  # живой журнал для интерфейса: ход LLM виден сразу, до выполнения инструментов
            on_step(result.steps[-1])
        if not turn["tool_calls"]:
            result.answer = turn["content"]
            break

        messages.append(
            {
                "role": "assistant",
                "content": turn["content"] or None,
                "tool_calls": [
                    {"id": c["id"], "type": "function", "function": {"name": c["name"], "arguments": c["arguments"]}}
                    for c in turn["tool_calls"]
                ],
            }
        )
        for call in turn["tool_calls"]:
            t = by_name.get(call["name"])
            t0 = time.monotonic()
            if t is None:
                output, ok = f"Нет инструмента {call['name']}", False
            elif t.mutating:
                result.pending_actions.append({"tool": t.name, "arguments": call["arguments"]})
                output, ok = "Действие отправлено пользователю на подтверждение и пока не выполнено.", True
            else:
                output, ok = _run_tool(t, call["arguments"])
            result.steps.append(
                {
                    "type": "tool",
                    "name": call["name"],
                    "arguments": call["arguments"],
                    "output": output[:2000],
                    "ok": ok,
                    "ms": round((time.monotonic() - t0) * 1000),
                }
            )
            messages.append({"role": "tool", "tool_call_id": call["id"], "content": output})
    else:
        result.stopped = "max_steps"

    result.source = "cache" if sources == {"cache"} else "live"
    return result


def execute_confirmed(action: dict, tools: list[Tool]) -> tuple[str, bool]:
    """Выполнить действие из `pending_actions` после подтверждения пользователем."""
    t = {t.name: t for t in tools}.get(action["tool"])
    if t is None:
        return f"Нет инструмента {action['tool']}", False
    return _run_tool(t, action["arguments"])
