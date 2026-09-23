// Форматирование для русского интерфейса. Все времена API — местные UTC+5 без смещения: не прогоняем их через Date,
// чтобы браузер в другом поясе ничего не сдвинул.

const NBSP = ' '

/** 0.4213 → «42 %». */
export function pct(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return '—'
  return `${(v * 100).toFixed(digits).replace('.', ',')}${NBSP}%`
}

/** 9.83 → «9,8». */
export function num(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toFixed(digits).replace('.', ',')
}

/** Часы работы на полную мощность: 9.83 → «9,8 ч». */
export function hoursFull(v: number | null | undefined): string {
  return v == null ? '—' : `${num(v)}${NBSP}ч`
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

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

/** "2026-02-10" → «10 фев». */
export function dateShort(s: string): string {
  const { m, day } = parts(s)
  return `${day}${NBSP}${MONTHS[m - 1]}`
}

/** "2026-02-10" → «вт». */
export function weekday(s: string): string {
  const { y, m, day } = parts(s)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]
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
  return v >= 1000 ? `${num(v / 1000)}${NBSP}с` : `${v}${NBSP}мс`
}

/** Экранирование текста для HTML-тултипов ECharts (formatter возвращает HTML). */
export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
