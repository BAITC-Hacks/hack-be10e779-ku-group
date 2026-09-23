import type ru from '../ru/app'
import type { Dict } from '../../core'

const kk: Dict<typeof ru> = {
  brand: { name: 'Анемо', title: 'Анемо — ЖЭС өндіретін энергияның агенттік болжамы', tagline: 'станция уақыты UTC+5', station: 'ЖЭС, 2 турбина (Алматы облысы)' },
  tabs: {
    aria: 'Бөлімдер',
    forecast: 'Болжам',
    february: 'Ақпан 2026',
    quality: 'Модель сапасы',
    project: 'Жоба туралы',
  },
  headline: {
    label: 'Ертеңгі болжам қатесі',
    vs: 'қарапайым есепте {value}',
    title: 'Бір тәулік алға жасалған болжамның MAE көрсеткіші, номиналдың %-ы · {period} · толығырақ — «Модель сапасы» бөлімінде',
  },
  mode: {
    liveTitle: 'Қадамдар туралы шешімді LLM құралдарды шақыру арқылы қабылдайды. Сандарды код есептейді.',
    demoTitle:
      'LLM кілті берілмеген: дәл сол циклді детерминделген жоспарлаушы орындайды. Ауа райы, модель және есептеулер — шынайы.',
    withoutLlm: 'LLM-сіз',
  },
  connecting: 'Қосылуда…',
  about: 'Жүйе туралы',
  theme: {
    label: 'Тақырып',
    light: 'Жарық',
    dark: 'Қараңғы',
    system: 'Жүйедегідей',
  },
  language: { label: 'Интерфейс тілі' },
  server: {
    retry: 'Қайталау',
    unavailable: 'Сервер қолжетімсіз: {error}. Қосымшаның іске қосылғанын тексеріңіз ({command}).',
  },
}
export default kk
