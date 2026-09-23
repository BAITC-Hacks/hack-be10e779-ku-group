import type ru from '../ru/project'
import type { Dict } from '../../core'

const en: Dict<typeof ru> = {
  hero: {
    eyebrow: 'HackAlem AI 2026 · Energy track · team KU group',
    tagline: ' — an AI agent that forecasts a wind farm’s hourly output two days ahead',
    lead:
      'The dispatcher picks a date, and the agent does the rest: it pulls weather forecasts from 7 sources (6 models from global weather centres plus Open-Meteo’s auto-selection), runs the model, checks the result and explains how much energy to expect, where the peaks and dips are, and which hours need reserve.',
    openForecast: 'Open forecast',
    allFebruary: 'Period forecast',
  },
  stats: {
    error: 'average error of the next-day forecast, as a share of maximum power',
    gain: 'less error than a simple wind-based calculation',
    steps: 'agent steps, from weather to validation and recalculation',
    february: 'forecasts for all of February 2026, reproduced as if made at the time',
  },
  why: {
    title: 'Why it matters',
    text: 'Wind changes fast: a farm can stand idle for a day, then reach full power within a few hours. The grid needs to know in advance how much electricity each hour will bring — otherwise shortfalls or surpluses have to be covered, and that costs money.',
    bid: 'Renewable producers submit an hourly supply bid by 08:00 on the day before the operating day',
    bidLink: 'Order No. 164 of the Ministry of Energy of Kazakhstan, clause 9',
    imbalance: 'Imbalances are settled for every hour',
    imbalanceLink: 'balancing market rules, clause 78',
    fleet: 'Kazakhstan has 57 wind farms with a total of 1,525.7 MW',
    fleetLink: 'KEGOC annual report 2024',
  },
  agent: {
    title: 'What the AI agent does',
    lead: 'The agent runs the full cycle on its own — 7 steps, each a tool. In **LIVE** mode, an LLM chooses the order of steps and makes decisions (such as excluding a weather source) via tool calls. In **review mode** (no API key), a planner runs the same cycle by the same rules. **The LLM never makes up numbers** — code computes everything; the agent drives the steps and explains the result.',
    passport:
      'Every run is saved as an immutable version with a “passport”: which data and weather issues were used, model and calibration versions, and input and output hashes.',
  },
  tools: {
    rank_weather_sources: {
      title: 'Ranks weather sources',
      text: 'Accuracy of 7 weather sources over the last 30 days and data gaps for the forecast hours.',
    },
    fetch_weather: {
      title: 'Fetches archived weather forecasts',
      text: 'Only issues published before the forecast time; incomplete sources are excluded.',
    },
    build_features: {
      title: 'Prepares the data',
      text: '48 feature rows: wind from different models, their mean and spread, horizon, calendar.',
    },
    run_forecast: {
      title: 'Runs the model',
      text: 'Hourly forecast for the farm and each turbine, plus a likely p10–p90 range.',
    },
    validate_forecast: {
      title: 'Validates the result',
      text: '48 consecutive hours, values within 0–100%, p10 ≤ p50 ≤ p90 ordering, weather publication time. Fixes any errors.',
    },
    analyze_forecast: {
      title: 'Analyzes the forecast',
      text: 'Peaks, dips, uncertain hours, disagreement between weather models.',
    },
    compare_with_previous: {
      title: 'Recalculates and compares',
      text: 'Compares today’s forecast for tomorrow with yesterday’s for the same hours and flags revisions.',
    },
  },
  model: {
    title: 'How the model works',
    dataTitle: 'Data',
    data: 'History of two turbines from the organizer: readings every 10 minutes from 11 March 2023 to 31 January 2026 — wind, power, temperature. Farm = average of the two turbines.',
    weatherTitle: 'Weather',
    weather:
      'Open-Meteo forecast archive: 6 models from global weather centres (ECMWF, ICON, GFS, JMA, CMA, GEM) plus best_match auto-selection. For each hour, the latest issue already published by the forecast time is used (with a 7-hour publication buffer).',
    modelTitle: 'Model',
    model:
      'Gradient boosting (scikit-learn) outputs three levels — p10, p50, p90 — plus a forecast for each turbine. The range is further calibrated (split-conformal) by wind regime.',
    check: 'Checked on historical data',
    ours: 'Our model',
    curve: 'Simple wind-based calculation',
    persistence: '“Tomorrow like today”',
    note: 'Average error of the next-day forecast, % of maximum power. Lower is better.',
  },
  honesty: {
    title: 'Data integrity',
    asOf: 'Forecasts are made as of the time: on the evening of day D for D+1 and D+2, using only what was known by 23:59.',
    noActualWeather: 'Actual weather for the forecast days and reanalysis are never used.',
    test: 'A code test goes through every weather issue used and checks that it was published before the forecast time.',
    noFebruaryActuals: 'There is no actual output data for February, so the interface shows only forecasts for February — no made-up “actuals”.',
    modeLabel: 'The mode (LIVE or review mode without a key) is always labelled: recorded responses are never passed off as live LLM output.',
  },
  roadmap: {
    title: 'What’s next',
    lead: 'Development roadmap — not part of the current version.',
    map: {
      title: 'Owner’s fleet map',
      text: 'All of a company’s wind farms and turbines on one map, each turbine with its own history, model and forecast.',
    },
    compare: {
      title: 'Analysis by turbine, group and area',
      text: 'Comparing turbines under the same wind: “T2 produces 20% less than T1” is an early sign of a fault.',
    },
    bid: {
      title: 'Market bid by 08:00',
      text: 'Converting the forecast to MW using rated power, plus a ready hourly bid for the next day.',
    },
    intraday: {
      title: 'Intraday correction',
      text: 'Refining the forecast with SCADA telemetry during the day and assessing imbalance risk hour by hour.',
    },
    assistant: {
      title: 'Dispatcher assistant agent',
      text: 'Alerts when the forecast is revised, answers to questions like “why did the 15:00 forecast drop?”, and a morning summary.',
    },
  },
  limits: {
    title: 'Limitations, honestly',
    noFebruaryActuals: 'There is no actual output data for February 2026 — quality was checked on October 2025 to January 2026.',
    shareOfMax: 'Power is given as a share of the maximum: without the farm’s rated power it can’t be converted to MW.',
    gap: 'Turbine 1 has a data gap in May–July 2024; incomplete hours are excluded.',
    coverage: 'After calibration, the likely range covers 77.5% of January hours against an 80% target.',
    twoTurbines: 'The model is trained for these two turbines; another farm would need its own history.',
    thresholds: 'Dispatcher card thresholds (10 and 30 pp) are team settings, not a regulatory standard.',
  },
  team: {
    title: 'Team and versions',
    polyakov: { name: 'Maksim Polyakov', role: 'Data, weather, model, AI agent, API' },
    leonteva: { name: 'Oksana Leonteva', role: 'Web interface, design, API contract, coordination' },
    golovko: { name: 'Vladimir Golovko', role: 'Features beyond the brief, presentation' },
    aiNote:
      'Built with the help of AI assistants Claude Code and OpenAI Codex. The core functionality was created on 23.09.2026 between 13:00 and 18:00.',
    version: 'Version',
    build: 'Server build',
    agentMode: 'Agent mode',
    demo: 'Review mode (no key)',
    period: 'Forecasts for the period',
    history: 'Data history',
    stackTitle: 'Tech stack',
    stack: {
      python: 'Python 3.12 · pandas · NumPy',
      sklearn: 'scikit-learn — quantile gradient boosting',
      api: 'FastAPI · Uvicorn · Pydantic',
      llm: 'OpenAI API — function calling in LIVE',
      web: 'React · TypeScript · Vite · ECharts · Leaflet',
      data: 'Open-Meteo Previous Runs (CC BY 4.0) · OpenStreetMap',
      docker: 'Docker Compose — one container, one port',
    },
  },
}
export default en
