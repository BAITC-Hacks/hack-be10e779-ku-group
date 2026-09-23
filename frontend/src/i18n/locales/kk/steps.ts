import type ru from '../ru/steps'
import type { Dict } from '../../core'

const kk: Dict<typeof ru> = {
  step: 'Қадам',
  stages: {
    weather: 'Ауа райы',
    prep: 'Дайындық',
    model: 'Модель',
    forecast: 'Болжам',
    analysis: 'Талдау',
    update: 'Қайта есептеу',
  },
  tools: {
    rank_weather_sources: 'Ауа райы дереккөздерін бағалау',
    fetch_weather: 'Мұрағаттағы ауа райы болжамы',
    build_features: 'Белгілерді дайындау',
    run_forecast: 'Модель және сағаттық болжам',
    validate_forecast: 'Нәтижені шығармас бұрын тексеру',
    analyze_forecast: 'Нәтижені талдау',
    compare_with_previous: 'Қайта есептеу: алдыңғы шығарылыммен салыстыру',
    prepare_features: 'Белгілерді дайындау',
    run_model: 'Энергия өндіру моделі',
    hourly_forecast: 'Сағаттық болжам',
  },
}
export default kk
