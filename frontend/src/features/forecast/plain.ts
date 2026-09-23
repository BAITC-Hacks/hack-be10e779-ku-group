// Перевод ответа бэкенда на человеческий язык: вывод одной фразой, карточки «что сделать», предупреждения без жаргона.
// Смысл и числа не меняются — только формулировки; исходный текст бэкенда остаётся в подсказке (title).

import type { Card } from '../../api/types'
import { hourOf, num, pct } from '../../lib/format'
import { dayLabel, prettyDates } from './model'

/** Порог «высокой неуверенности» — тот же, что во флаге бэкенда (pipeline.analyze: ширина интервала > 0.45). */
export const WIDE = 0.45

/** «10.02 вт, 00:00–23:00» или «10.02 вт 00:00 – 11.02 ср 23:00». */
export function hoursRange(hours: string[]): string {
  if (hours.length === 0) return ''
  const a = hours[0]
  const b = hours[hours.length - 1]
  if (a.slice(0, 10) === b.slice(0, 10)) return `${dayLabel(a)}, ${hourOf(a)}–${hourOf(b)}`
  return `${dayLabel(a)} ${hourOf(a)} – ${dayLabel(b)} ${hourOf(b)}`
}

/** Карточка бэкенда → заголовок, текст и действие по-человечески. */
export function plainCard(c: Card): { title: string; text: string; action: string } {
  const action = c.action ? c.action.charAt(0).toUpperCase() + c.action.slice(1) : ''
  switch (c.kind) {
    case 'revision':
      return {
        title: 'Прогноз заметно изменился со вчерашнего',
        text: `${num(c.value, 0)} ч из 24 сдвинулись на 10 п.п. и больше — погода обновилась.`,
        action,
      }
    case 'wide_interval':
      return {
        title: 'Неуверенные часы',
        text: `${num(c.value, 0)} ч с широким разбросом возможной выработки (больше 30 п.п.).`,
        action,
      }
    default:
      return { title: c.title, text: prettyDates(c.text), action }
  }
}

/** Флаг анализа бэкенда → понятная фраза. Неизвестный формат — как есть (с датами в привычном виде). */
export function plainFlag(flag: string): string {
  let m = flag.match(/ширина интервала p10–p90 = ([\d.]+)/)
  if (m) return `Высокая неуверенность: вероятный диапазон в среднем шириной ${pct(Number(m[1]))} мощности — прогноз менее точный.`
  m = flag.match(/расходится с кривой мощности \(в среднем ([\d.]+)\)/)
  if (m)
    return `Модель расходится с простым пересчётом ветра в мощность в среднем на ${pct(Number(m[1]))} — стоит проверить входные данные.`
  m = flag.match(/Модели погоды расходятся \(разброс ветра 100 м в среднем ([\d.]+) м\/с\)/)
  if (m) return `Погодные модели не согласны между собой (в среднем на ${num(Number(m[1]))} м/с) — прогноз менее надёжен.`
  return prettyDates(flag)
}

/** Уровень уверенности по средней ширине интервала: тот же порог, что у бэкенда. */
export function confidence(width: number | null | undefined): { tone: 'ok' | 'warn'; label: string } | null {
  if (width == null) return null
  return width > WIDE
    ? { tone: 'warn', label: 'уверенность низкая — широкий вероятный диапазон' }
    : { tone: 'ok', label: 'уверенность нормальная' }
}
