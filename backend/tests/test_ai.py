"""Агентный цикл и LLMClient без сети: подменяем ходы модели, инструменты исполняются настоящим кодом."""

from pydantic import BaseModel

from app.ai.agent import execute_confirmed, run_agent, tool
from app.ai.llm import LLMClient, LLMUnavailable


class AddArgs(BaseModel):
    a: int
    b: int


@tool("Сложить два числа", AddArgs)
def add(args: AddArgs):
    return {"sum": args.a + args.b}


@tool("Записать значение", AddArgs, mutating=True)
def save(args: AddArgs):
    return {"saved": args.a}


class FakeLLM:
    def __init__(self, turns):
        self.turns = iter(turns)

    def chat(self, messages, tools=None, json_mode=False):
        return {"source": "cache", **next(self.turns)}


def call(name, args, id_="c1"):
    return {"content": "", "tool_calls": [{"id": id_, "name": name, "arguments": args}]}


def test_agent_runs_tool_and_answers():
    llm = FakeLLM([call("add", '{"a": 2, "b": 3}'), {"content": "Ответ: 5", "tool_calls": []}])
    r = run_agent("sys", "2+3?", [add], llm=llm)
    assert r.answer == "Ответ: 5"
    assert r.steps[1] == {**r.steps[1], "type": "tool", "ok": True, "output": '{"sum": 5}'}
    assert r.source == "cache"


def test_tool_error_goes_back_to_model():
    llm = FakeLLM([call("add", '{"a": "x"}'), {"content": "не смог", "tool_calls": []}])
    r = run_agent("sys", "?", [add], llm=llm)
    assert r.steps[1]["ok"] is False and "Ошибка аргументов" in r.steps[1]["output"]


def test_mutating_tool_needs_confirmation():
    llm = FakeLLM([call("save", '{"a": 1, "b": 0}'), {"content": "жду подтверждения", "tool_calls": []}])
    r = run_agent("sys", "?", [save], llm=llm)
    assert r.pending_actions == [{"tool": "save", "arguments": '{"a": 1, "b": 0}'}]
    assert execute_confirmed(r.pending_actions[0], [save]) == ('{"saved": 1}', True)


def test_max_steps():
    llm = FakeLLM([call("add", '{"a": 1, "b": 1}', f"c{i}") for i in range(20)])
    assert run_agent("sys", "?", [add], llm=llm).stopped == "max_steps"


def test_demo_mode_cache_miss_is_honest(tmp_path):
    client = LLMClient()
    client.cache_dir = tmp_path
    try:
        client.chat([{"role": "user", "content": "нет в кэше"}])
        raise AssertionError("должна быть ошибка")
    except LLMUnavailable as exc:
        assert "нет сохранённого ответа" in str(exc)


def test_demo_mode_reads_cache(tmp_path):
    import json

    from app.ai.llm import _key

    client = LLMClient()
    client.cache_dir = tmp_path
    msgs = [{"role": "user", "content": "привет"}]
    key = _key(client.model, {"messages": msgs, "tools": None, "json_mode": False})
    (tmp_path / f"{key}.json").write_text(json.dumps({"content": "здравствуйте", "tool_calls": [], "model": "m"}))
    assert client.chat(msgs)["content"] == "здравствуйте"
