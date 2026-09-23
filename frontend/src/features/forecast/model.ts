// Вспомогательные функции вкладки «Прогноз»: выбор объекта, KPI по турбинам, подписи дат, выгрузка журнала.
// Всё считается только из ответа бэкенда — никаких выдуманных значений.

import type { Forecast, HourPoint } from '../../api/types'
import { LOW_POWER } from '../../lib/constants'
import { addDays, dateRu, dateTime, weekday } from '../../lib/format'

export type ObjectId = 'station' | 't1' | 't2'

export const OBJECTS: { id: ObjectId; label: string }[] = [
  { id: 'station', label: 'Станция' },
  { id: 't1', label: 'Турбина 1' },
  { id: 't2', label: 'Турбина 2' },
]

export function objectLabel(id: ObjectId): string {
  return OBJECTS.find((o) => o.id === id)?.label ?? id
}

/** Значение прогноза для объекта: станция — p50, турбина — t1/t2 (может отсутствовать). */
export function valueOf(h: HourPoint, obj: ObjectId): number | null {
  if (obj === 'station') return h.p50
  const v = h[obj]
  return v == null || Number.isNaN(v) ? null : v
}

/** "2026-02-10" или "2026-02-10T13:00" → «10.02». */
export function ddmm(s: string): string {
  return dateRu(s).slice(0, 5)
}

/** "2026-02-10" → «10.02 вт». */
export function dayLabel(s: string): string {
  return `${ddmm(s)} ${weekday(s)}`
}

/** Даты суток D+1 и D+2 для выпуска D. */
export function targetDays(issueDate: string): [string, string] {
  return [addDays(issueDate, 1), addDays(issueDate, 2)]
}

/** Приводим "2026-02-11 20:00:00" и "2026-02-11T20:00" к одному виду. */
export function normTime(s: string): string {
  return s.replace(' ', 'T').slice(0, 16)
}

export type Kpi = {
  energyD1: number | null // часы работы на полной мощности за сутки D+1
  energyD2: number | null
  peakTime: string | null
  peakValue: number | null
  lowHours: number | null
  hoursTotal: number
}

/** KPI объекта. Станция — из summary бэкенда; турбина — пересчёт из t1/t2 по тем же правилам (сумма, максимум, < 5 %). */
export function kpiFor(f: Forecast, obj: ObjectId): Kpi {
  if (obj === 'station') {
    const s = f.summary
    const peak = s.peak_hour ? f.hours.find((h) => normTime(h.time) === normTime(s.peak_hour)) : undefined
    return {
      energyD1: s.energy_d1 ?? null,
      energyD2: s.energy_d2 ?? null,
      peakTime: s.peak_hour ?? null,
      peakValue: peak?.p50 ?? null,
      lowHours: s.low_hours ?? null,
      hoursTotal: f.hours.length,
    }
  }
  const sum = (day: 1 | 2) => {
    const vals = f.hours.filter((h) => h.lead_day === day).map((h) => valueOf(h, obj))
    if (vals.length === 0 || vals.some((v) => v == null)) return null
    return (vals as number[]).reduce((a, b) => a + b, 0)
  }
  let peak: HourPoint | null = null
  let peakValue: number | null = null
  let low = 0
  let known = 0
  for (const h of f.hours) {
    const v = valueOf(h, obj)
    if (v == null) continue
    known += 1
    if (v < LOW_POWER) low += 1
    if (peakValue == null || v > peakValue) {
      peakValue = v
      peak = h
    }
  }
  return {
    energyD1: sum(1),
    energyD2: sum(2),
    peakTime: peak?.time ?? null,
    peakValue,
    lowHours: known === f.hours.length && known > 0 ? low : null,
    hoursTotal: f.hours.length,
  }
}

/** ISO-даты в тексте бэкенда (объяснение, флаги) → привычный вид «11.02 20:00», «09.02.2026». Смысл не меняется. */
export function prettyDates(text: string): string {
  return text
    .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?\b/g, (m) => dateTime(m))
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, (m) => dateRu(m))
}

export function hasActual(f: Forecast): boolean {
  return f.hours.some((h) => h.actual != null)
}
