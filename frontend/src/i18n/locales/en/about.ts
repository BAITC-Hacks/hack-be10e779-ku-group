import type ru from '../ru/about'
import type { Dict } from '../../core'

const en: Dict<typeof ru> = {
  title: 'About the system',
  closeAria: 'Close “About the system”',
  bodyAria: 'System description',
  what: {
    title: 'What it does',
    lead: 'Builds an hourly output forecast for a two-turbine wind farm ({station}) for 48 hours — days D+1 and D+2 — with a p10–p90 uncertainty band, for the whole farm and for each turbine. Forecasts are reproduced as if they were made in the past: issues from {from} to {to} cover all of February 2026. Power is in % of rated power: installed capacity in MW is not in the data.',
  },
  cycle: {
    title: 'Agent cycle',
    loop: 'Recalculation → Weather: when a fresh weather issue arrives or a source is excluded, the forecast is computed again.',
    live: 'An LLM chooses the order of steps and which weather sources to exclude via tool calls',
    liveEnd: '. If the LLM doesn’t finish the cycle, the planner completes it, and this shows in the log.',
    demo: 'Without an API key, a deterministic planner runs the same cycle — the weather, model and calculations are real.',
    note: 'In both modes, code computes the numbers: the LLM never makes up forecast values.',
  },
  stages: {
    weather: {
      name: 'Weather',
      text: 'archived Open-Meteo forecast issued before the forecast time; sources with data gaps are excluded',
    },
    prep: {
      name: 'Preparation',
      text: 'hourly features: wind at 10 and 100 m, gusts, direction, temperature, calendar, weather model ensemble',
    },
    model: { name: 'Model', text: 'quantile boosting: p10 / p50 / p90 for the farm and a forecast for each turbine' },
    forecast: { name: 'Forecast', text: '48 hourly values — days D+1 and D+2 — with a p10–p90 band' },
    analysis: {
      name: 'Analysis',
      text: 'plausibility, uncertainty and weather-source disagreement checks, plus an explanation',
    },
    recalc: {
      name: 'Recalculation',
      text: 'day D+1 is compared with the forecast for the same hours from the previous issue (based on older weather)',
    },
  },
  honesty: {
    title: 'Data integrity',
    momentBefore: 'Forecast time is the end of day D,',
    momentAfter: '(station time).',
    horizonBefore:
      'Day D+1 comes from a weather forecast issued about 24 h before the hour, D+2 from one issued about 48 h before (Open-Meteo archive,',
    horizonAfter: '). Issue time follows the archive’s definition; publication delay is not accounted for.',
    noActualWeather: 'Actual weather (observations, reanalysis) for the forecast days is not used.',
    noFebruaryActuals:
      'There is no actual output data for February 2026 — quality is checked on earlier months (Model quality tab).',
  },
  model: {
    title: 'Model',
    boosting: 'scikit-learn gradient boosting with p10 / p50 / p90 quantiles; separate models for turbines 1 and 2.',
    features:
      'Features come from a weather model ensemble: ECMWF, ICON, GFS (wind at 100 and 10 m), JMA, CMA, GEM (wind at 10 m), plus their mean and spread.',
    calibration: 'The p10–p90 band is further widened by conformal calibration by wind regime.',
    baselines: 'Baselines for comparison: a power curve applied to forecast wind, and persistence (“tomorrow like today”).',
  },
  station: {
    title: 'Wind farm',
    turbine: 'Turbine {n}',
    north: 'N',
    south: 'S',
    east: 'E',
    west: 'W',
    time: 'All times are local station time, UTC{offset}',
    history: 'Measurement history: {from} — {to}, 10-minute step, averaged to hourly.',
  },
  sources: {
    title: 'Sources and licenses',
    weather: 'Weather',
    license: 'license',
    offline: '. No key needed; responses are stored locally, so forecasting works offline.',
    turbines: 'Turbine data: provided by the HackAlem AI 2026 hackathon organizer.',
    columns: 'Weather columns:',
  },
  version: {
    title: 'Version',
    build: 'Build',
    mode: 'Mode',
    server: 'Server',
    demo: 'DEMO · no LLM',
    offline: 'No connection to the server — version and mode unknown.',
  },
}
export default en
