"""Агент прогноза выработки ВЭС: полный цикл ТЗ выполняется вызовами инструментов.

Цикл: проверка источников погоды → получение архивного прогноза → подготовка признаков → модель → почасовой прогноз
→ анализ → пересчёт при обновлении входа. Решения агента — не декоративные:
  • источник погоды с дырами в окне прогноза или заметно хуже остальных исключается, прогноз пересчитывается;
  • интервал неуверенности калибруется по режиму ветра (конформная поправка);
  • сутки D+1 сравниваются с прогнозом прошлого выпуска (по более старой погоде) — это «повторный расчёт при обновлении».
Режимы: LIVE — порядок шагов и решения выбирает LLM (OpenAI API, function calling); DEMO — без ключа тот же цикл проходит
детерминированный планировщик. Числа в обоих режимах считает код, LLM их не придумывает.
"""

import json
import time

import pandas as pd
from pydantic import BaseModel, Field

from app.ai.agent import run_agent, tool
from app.ai.llm import LLMClient, LLMUnavailable
from app.forecast import calibrate, data, model, passport, pipeline, weather

LAST_KNOWN = pd.Timestamp("2026-01-31 23:00")  # позже этого факта нет вообще
BAD_SOURCE_MISSING = 0.2
_state: dict[str, dict] = {}  # промежуточные результаты текущего запуска, ключ — дата выпуска


class IssueArgs(BaseModel):
    issue_date: str = Field(description="Дата выпуска прогноза YYYY-MM-DD (прогноз делается в конце этого дня)")


class FetchArgs(IssueArgs):
    exclude_sources: list[str] = Field(default_factory=list, description="Источники погоды, которые не использовать")


def _st(issue_date: str) -> dict:
    return _state.setdefault(issue_date, {"exclude": []})


@tool("Точность источников погоды за 30 дней до момента прогноза и полнота их данных в окне прогноза", IssueArgs)
def rank_weather_sources(a: IssueArgs) -> dict:
    pipeline.check_issue_date(a.issue_date)
    until = min(pd.Timestamp(a.issue_date) + pd.Timedelta(hours=23), LAST_KNOWN)
    skill = calibrate.source_skill(until)
    leads = pipeline.window_leads(a.issue_date)
    window = leads.index
    gaps: dict[str, int] = {}
    for n in sorted(set(leads)):
        ens = weather.ensemble_for_lead(int(n)).reindex(window[leads.to_numpy() == n])
        for c in ens.columns:
            gaps[c] = gaps.get(c, 0) + int(ens[c].isna().sum())
    for r in skill:
        r["missing_hours_in_window"] = gaps.get(r["source"], 0)
    _st(a.issue_date)["skill"] = skill
    return {"measured_until": str(until), "window_hours": len(window), "sources": skill}


@tool("Получить архивный прогноз погоды, доступный в конце дня issue_date, и проверить честность по времени", FetchArgs)
def fetch_weather(a: FetchArgs) -> dict:
    pipeline.check_issue_date(a.issue_date)
    st = _st(a.issue_date)
    st["exclude"] = sorted(set(a.exclude_sources))
    info = pipeline.get_weather(a.issue_date)
    issue_end = model.issue_moment(pd.Timestamp(a.issue_date))
    leads = pipeline.window_leads(a.issue_date)
    delay = pd.Timedelta(hours=weather.PUBLISH_DELAY_H)
    runs = pd.Series([h - pd.Timedelta(days=int(n)) for h, n in leads.items()])
    latest_published = runs.max() + delay
    info["time_integrity"] = {
        "issued_at": issue_end.strftime("%Y-%m-%dT%H:%M"),
        "latest_weather_run": runs.max().strftime("%Y-%m-%dT%H:%M"),
        "latest_run_published_by": latest_published.strftime("%Y-%m-%dT%H:%M"),
        "ok": bool(latest_published <= issue_end),
        "rule": f"для каждого часа — самый свежий выпуск, опубликованный до момента прогноза (задержка публикации "
                f"{weather.PUBLISH_DELAY_H} ч); фактическая погода не используется",
    }
    info["excluded_sources"] = st["exclude"]
    st["weather"] = info
    return info


@tool("Подготовить признаки на 48 часов из полученной погоды (с учётом исключённых источников)", IssueArgs)
def build_features(a: IssueArgs) -> dict:
    st = _st(a.issue_date)
    if "weather" not in st:
        return {"error": "Сначала fetch_weather"}
    x = model.exclude_sources(pipeline.prepare(a.issue_date), st["exclude"])
    st["x"] = x
    return {"hours": len(x), "features": len(model.FEATURES), "missing_values": int(x[model.FEATURES].isna().sum().sum()),
            "ens_ws100_mean": round(float(x["ens_ws100_mean"].mean()), 2),
            "ens_spread_mean": round(float(x["ens_ws100_std"].mean()), 2)}


@tool("Запустить модель и сформировать почасовой прогноз p10/p50/p90 с калиброванным интервалом", IssueArgs)
def run_forecast(a: IssueArgs) -> dict:
    st = _st(a.issue_date)
    if "x" not in st:
        return {"error": "Сначала build_features"}
    x = st["x"]
    pred = pipeline.run_model(x)
    cal = calibrate.load()
    pred["p10"], pred["p90"] = calibrate.apply(pred["p10"], pred["p90"], x["ens_ws100_mean"].fillna(x["ws100"]),
                                               cal["widen_by_regime"])
    st["hours"] = pipeline.hourly_forecast(a.issue_date, x, pred)
    d1 = [h["p50"] for h in st["hours"] if h["lead_day"] == 1]
    d2 = [h["p50"] for h in st["hours"] if h["lead_day"] == 2]
    return {"hours": len(st["hours"]), "energy_d1": round(sum(d1), 2), "energy_d2": round(sum(d2), 2),
            "calibration": cal["method"], "interval_coverage_check": cal["coverage_after"]}


@tool("Проанализировать прогноз: проверки правдоподобия, неопределённость, пики и провалы", IssueArgs)
def analyze_forecast(a: IssueArgs) -> dict:
    st = _st(a.issue_date)
    if "hours" not in st:
        return {"error": "Сначала run_forecast"}
    res = pipeline.analyze(st["hours"], st["weather"])
    spread = float(st["x"]["ens_ws100_std"].mean())
    if spread > 1.5:
        res.flags.append(f"Модели погоды расходятся (разброс ветра 100 м в среднем {spread:.1f} м/с) — прогноз менее надёжен")
    st["analysis"] = {"flags": res.flags, "summary": res.summary}
    return st["analysis"]


@tool("Сравнить новый прогноз с сохранённым прошлым выпуском (пересмотр после обновления погоды)", IssueArgs)
def compare_with_previous(a: IssueArgs) -> dict:
    st = _st(a.issue_date)
    if "hours" not in st:
        return {"error": "Сначала run_forecast"}
    prev_issue = str((pd.Timestamp(a.issue_date) - pd.Timedelta(days=1)).date())
    prev = passport.latest(prev_issue)
    if prev:
        st["update"] = passport.compare(prev, st["hours"])
    else:  # прошлого выпуска нет в хранилище (например, первый выпуск 31.01) — реконструкция текущей моделью
        st["update"] = {**pipeline.compare_with_previous(a.issue_date, st["hours"]),
                        "method": "реконструкция (сохранённого прошлого выпуска нет)", "hours_changed_10pp": 0,
                        "changed_hours": [], "common_hours": 24}
    return st["update"]


TOOLS = [rank_weather_sources, fetch_weather, build_features, run_forecast, analyze_forecast, compare_with_previous]

SYSTEM = """Ты — агент прогноза выработки ветроэлектростанции (2 турбины, Алматинская обл.) для диспетчера.
Выполни полный цикл через инструменты, для даты выпуска из запроса:
1) rank_weather_sources — оцени источники погоды; 2) fetch_weather — получи архивный прогноз; если у источника есть пропуски
в окне прогноза (missing_hours_in_window > 4) — передай его в exclude_sources. Высокая ошибка ветра сама по себе
не повод исключать: проверено, что модель уже учитывает качество источников, и исключение по ошибке не улучшает прогноз;
3) build_features; 4) run_forecast; 5) analyze_forecast; 6) compare_with_previous.
Если после анализа видно, что причина проблемы — источник погоды, исключи его и повтори шаги 2–5 (не больше одного раза).
Правила: все числа бери только из ответов инструментов, ничего не придумывай. Погода — только архивная, фактическую не проси.
В конце — краткое объяснение для диспетчера по-русски (5–7 предложений): ожидаемая выработка D+1 и D+2 в «часах работы на
полную мощность», пики и провалы, неопределённость, что изменилось относительно прошлого выпуска, какие источники исключены и почему."""


def _deterministic(issue_date: str) -> tuple[list[dict], str]:
    """DEMO: тот же цикл без LLM. Решения — по тем же правилам, что даны модели в SYSTEM."""
    steps: list[dict] = []

    def call(t, args: dict) -> dict:
        t0 = time.monotonic()
        out = t.fn(t.args(**args))
        steps.append({"type": "tool", "name": t.name, "arguments": json.dumps(args, ensure_ascii=False),
                      "output": json.dumps(out, ensure_ascii=False, default=str)[:1500], "ok": "error" not in out,
                      "ms": round((time.monotonic() - t0) * 1000)})
        return out

    rank = call(rank_weather_sources, {"issue_date": issue_date})
    # исключаем только источник с дырами в окне прогноза. Исключение «по ошибке ветра» проверено на окт–янв
    # (B0/B1): без gfs_ws100 MAE D+1 0.1495 против 0.1490 со всеми — не помогает, поэтому не применяется
    exclude = [s["source"] for s in rank["sources"] if s["source"] != "best_match_ws100"
               and s["missing_hours_in_window"] > 4]

    call(fetch_weather, {"issue_date": issue_date, "exclude_sources": exclude})
    call(build_features, {"issue_date": issue_date})
    run = call(run_forecast, {"issue_date": issue_date})
    an = call(analyze_forecast, {"issue_date": issue_date})
    upd = call(compare_with_previous, {"issue_date": issue_date})
    text = (f"Прогноз на {pd.Timestamp(issue_date).date() + pd.Timedelta(days=1)} и следующие сутки. "
            f"Ожидаемая выработка: D+1 — {run['energy_d1']} ч, D+2 — {run['energy_d2']} ч работы на полную мощность; "
            f"пик в {an['summary']['peak_hour'][11:16]} {an['summary']['peak_hour'][:10]}, часов почти без выработки — "
            f"{an['summary']['low_hours']}. ")
    text += (f"По сравнению с прошлым выпуском прогноз на {upd['day']} изменился в среднем на "
             f"{upd['mean_abs_change'] * 100:.1f} п.п. номинала ({'существенно' if upd['significant'] else 'незначительно'}). ")
    text += ("Исключены источники погоды: " + ", ".join(exclude) + ". ") if exclude else "Все источники погоды использованы. "
    text += ("Внимание: " + "; ".join(an["flags"]) + ".") if an["flags"] else "Замечаний нет."
    return steps, text


def run(issue_date: str, planner_only: bool = False) -> dict:
    """Один выпуск прогноза. Ответ — `Forecast` из docs/api-contract.md + паспорт и карточки.
    `planner_only` — без LLM (ретроспективный прогон февраля: 28 выпусков не тратят кредиты и воспроизводимы)."""
    pipeline.check_issue_date(issue_date)
    _state.pop(issue_date, None)
    llm = LLMClient()
    mode = "demo" if planner_only else llm.mode
    explanation, steps = "", []
    fallback = False
    if mode == "live":
        try:
            res = run_agent(SYSTEM, f"Сделай прогноз. Дата выпуска: {issue_date}.", TOOLS, llm)
            explanation, steps = res.answer, res.steps
        except LLMUnavailable:
            mode = "demo"
    st = _state.get(issue_date, {})
    if mode == "demo" or "analysis" not in st or "update" not in st:
        if mode == "live":
            fallback = True
            steps.append({"type": "model", "content": "LLM не завершила цикл — дошёл планировщик", "ms": 0})
        _state.pop(issue_date, None)
        s2, explanation2 = _deterministic(issue_date)
        steps += s2
        explanation = explanation or explanation2
        if mode == "live":
            explanation = explanation or explanation2
    st = _state[issue_date]
    forecast = {
        "issue_date": issue_date,
        "issued_at": f"{issue_date}T23:59",
        "weather_source": weather.SOURCE + " + ансамбль ECMWF/ICON/GFS/JMA/CMA/GEM",
        "weather_runs": st["weather"]["runs"],
        "time_integrity": st["weather"]["time_integrity"],
        "excluded_sources": st["exclude"],
        "hours": st["hours"],
        "summary": st["analysis"]["summary"],
        "analysis": {"flags": st["analysis"]["flags"], "changed_vs_previous": st["update"]["mean_abs_change"],
                     "update": st["update"]},
        "cards": passport.cards(st["hours"], st["update"], st["weather"], st["exclude"]),
        "explanation": explanation,
        "mode": mode,
        "fallback": fallback,
        "steps": steps,
    }
    pas = passport.build(issue_date, st["x"], st["hours"], st["weather"], st["exclude"], mode, steps)
    forecast["passport"] = passport.save(pas, forecast)
    return forecast


def history(start: str, end: str) -> list[dict]:
    h = data.load_hourly().loc[start:end]
    return [{"time": t.strftime("%Y-%m-%dT%H:%M"),
             "actual": None if pd.isna(r.power) else round(float(r.power), 4),
             "wind_measured": None if pd.isna(r.wind) else round(float(r.wind), 2)} for t, r in h.iterrows()]
