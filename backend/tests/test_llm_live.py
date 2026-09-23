"""Живой путь LLMClient на подменённом клиенте OpenAI: разбор tool_calls, запись кэша, воспроизведение в демо."""

import types

from openai.types.chat import ChatCompletion
from pydantic import BaseModel

from app.ai.agent import run_agent, tool
from app.ai.llm import LLMClient


def completion(content=None, tool_calls=None):
    return ChatCompletion.model_validate(
        {
            "id": "x",
            "object": "chat.completion",
            "created": 0,
            "model": "gpt-test",
            "choices": [
                {
                    "index": 0,
                    "finish_reason": "stop",
                    "message": {"role": "assistant", "content": content, "tool_calls": tool_calls},
                }
            ],
        }
    )


class A(BaseModel):
    a: int


@tool("Удвоить", A)
def double(x: A):
    return x.a * 2


def test_live_then_demo_replay(tmp_path):
    replies = iter(
        [
            completion(
                tool_calls=[{"id": "c1", "type": "function", "function": {"name": "double", "arguments": '{"a":4}'}}]
            ),
            completion("8"),
        ]
    )
    sent = []

    def create(**kw):
        sent.append(kw)
        return next(replies)

    live = LLMClient()
    live._client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
    live.cache_dir = tmp_path
    r = run_agent("sys", "u", [double], llm=live)
    assert (r.answer, r.source) == ("8", "live")
    assert [m["role"] for m in sent[1]["messages"]] == ["system", "user", "assistant", "tool"]

    demo = LLMClient()
    demo.cache_dir = tmp_path
    r2 = run_agent("sys", "u", [double], llm=demo)
    assert (r2.answer, r2.source) == ("8", "cache")
