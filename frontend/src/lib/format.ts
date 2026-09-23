// Форматирование под текущий язык интерфейса (ru / kk / en — см. src/i18n). Все времена API — местные UTC+5 без
// смещения: не прогоняем их через Date с часовым поясом, чтобы браузер в другом поясе ничего не сдвинул.

import { getLocale, type Locale } from '../i18n/core'

const NBSP = ' '

// десятичный разделитель: ru/kk — запятая, en — точка
const dec = (s: string) => (getLocale() === 'en' ? s : s.replace('.', ','))

/** 0.4213 → «42 %». */
export function pct(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return '—'
  return `${dec((v * 100).toFixed(digits))}${NBSP}%`
}

/** 9.83 → «9,8» (en — «9.8»). */
export function num(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return '—'
  return dec(v.toFixed(digits))
}

/** Целое с разрядами: 1344 → «1 344» (en — «1,344»). */
export function int(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return Math.round(v).toLocaleString(getLocale() === 'kk' ? 'kk-KZ' : getLocale()).replace(/ /g, NBSP)
}

const UNIT: Record<Locale, { h: string; s: string; ms: string }> = {
  ru: { h: 'ч', s: 'с', ms: 'мс' },
  kk: { h: 'сағ', s: 'с', ms: 'мс' },
  en: { h: 'h', s: 's', ms: 'ms' },
}

/** Часы работы на полную мощность: 9.83 → «9,8 ч» / «9,8 сағ» / «9.8 h». */
export function hoursFull(v: number | null | undefined): string {
  return v == null ? '—' : `${num(v)}${NBSP}${UNIT[getLocale()].h}`
}

const MONTHS: Record<Locale, string[]> = {
  ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  kk: ['қаң', 'ақп', 'нау', 'сәу', 'мам', 'мау', 'шіл', 'там', 'қыр', 'қаз', 'қар', 'жел'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}
const WEEKDAYS: Record<Locale, string[]> = {
  ru: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'],
  kk: ['жс', 'дс', 'сс', 'ср', 'бс', 'жм', 'сб'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}

function parts(s: string) {
  const [d, t = '00:00'] = s.replace(' ', 'T').split('T')
  const [y, m, day] = d.split('-').map(Number)
  return { y, m, day, time: t.slice(0, 5) }
}

/** "2026-02-10" → «10.02.2026». */
export function dateRu(s: string): string {
  const { y, m, day } = parts(s)
  return `${String(day).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`
}

/** "2026-02-10" → «10 фев» / «10 ақп» / «10 Feb». */
export function dateShort(s: string): string {
  const { m, day } = parts(s)
  return `${day}${NBSP}${MONTHS[getLocale()][m - 1]}`
}

/** "2026-02-10" → «вт» / «сс» / «Tue». */
export function weekday(s: string): string {
  const { y, m, day } = parts(s)
  return WEEKDAYS[getLocale()][new Date(Date.UTC(y, m - 1, day)).getUTCDay()]
}

/** "2026-02-10T13:00" → «10.02 13:00». */
export function dateTime(s: string): string {
  const { m, day, time } = parts(s)
  return `${String(day).padStart(2, '0')}.${String(m).padStart(2, '0')} ${time}`
}

/** "2026-02-10T13:00" → «13:00». */
export function hourOf(s: string): string {
  return parts(s).time
}

/** Сдвиг даты YYYY-MM-DD на n дней (без часовых поясов). */
export function addDays(s: string, n: number): string {
  const { y, m, day } = parts(s)
  const d = new Date(Date.UTC(y, m - 1, day + n))
  return d.toISOString().slice(0, 10)
}

/** 1234 мс → «1,2 с»; 80 → «80 мс». */
export function ms(v: number): string {
  const u = UNIT[getLocale()]
  return v >= 1000 ? `${num(v / 1000)}${NBSP}${u.s}` : `${v}${NBSP}${u.ms}`
}

/** Экранирование текста для HTML-тултипов ECharts (formatter возвращает HTML). */
export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
