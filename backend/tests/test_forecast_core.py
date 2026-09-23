import pandas as pd
import pytest

from app.forecast import pipeline, weather


def test_weather_request_uses_only_previous_runs_columns(monkeypatch, tmp_path):
    """Запрос погоды не содержит фактических значений, только выпуски за 1–2 суток."""
    captured = []

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"hourly": {}}

    def fake_get(url, params, timeout):
        captured.append({"url": url, "params": params, "timeout": timeout})
        return Response()

    monkeypatch.setattr(weather, "_cache_path", lambda model: tmp_path / "weather.json")
    monkeypatch.setattr(weather.httpx, "get", fake_get)

    for model_name in (None, *weather.ENSEMBLE):
        weather.fetch(refresh=True, model=model_name)

    assert len(captured) == 1 + len(weather.ENSEMBLE)
    for request in captured:
        requested = request["params"]["hourly"].split(",")
        assert requested
        assert all(name.endswith(("_previous_day1", "_previous_day2")) for name in requested)
        assert {name.rsplit("_previous_day", 1)[1] for name in requested} == {"1", "2"}


def test_prepare_maps_d1_to_lead_1_and_d2_to_lead_2(monkeypatch):
    calls = []

    def fake_features(index, lead):
        calls.append((index, lead))
        return pd.DataFrame({"lead": lead, "ws100": 5.0}, index=index)

    monkeypatch.setattr(pipeline.model, "features", fake_features)

    result = pipeline.prepare("2026-02-09")

    assert [(index[0], index[-1], lead) for index, lead in calls] == [
        (pd.Timestamp("2026-02-10 00:00"), pd.Timestamp("2026-02-10 23:00"), 1),
        (pd.Timestamp("2026-02-11 00:00"), pd.Timestamp("2026-02-11 23:00"), 2),
    ]
    assert result["lead"].tolist() == [1] * 24 + [2] * 24


def test_forecast_for_february_9_has_48_bounded_ordered_hours():
    result = pipeline.full_cycle("2026-02-09")
    hours = result["hours"]

    assert len(hours) == 48
    assert [row["lead_day"] for row in hours] == [1] * 24 + [2] * 24
    for row in hours:
        assert 0 <= row["p10"] <= row["p50"] <= row["p90"] <= 1


@pytest.mark.parametrize("issue_date", ["2026-01-30", "2026-02-28"])
def test_issue_date_outside_test_window_is_rejected(issue_date):
    with pytest.raises(ValueError):
        pipeline.check_issue_date(issue_date)
