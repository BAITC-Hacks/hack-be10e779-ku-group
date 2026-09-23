import type ru from '../ru/steps'
import type { Dict } from '../../core'

const en: Dict<typeof ru> = {
  step: 'Step',
  stages: {
    weather: 'Weather',
    prep: 'Preparation',
    model: 'Model',
    forecast: 'Forecast',
    analysis: 'Analysis',
    update: 'Recalculation',
  },
  tools: {
    rank_weather_sources: 'Ranking weather sources',
    fetch_weather: 'Archived weather forecast',
    build_features: 'Feature preparation',
    run_forecast: 'Model and hourly forecast',
    validate_forecast: 'Checking the result before release',
    analyze_forecast: 'Result analysis',
    compare_with_previous: 'Recalculation: comparison with the previous issue',
    prepare_features: 'Feature preparation',
    run_model: 'Generation model',
    hourly_forecast: 'Hourly forecast',
  },
}
export default en
