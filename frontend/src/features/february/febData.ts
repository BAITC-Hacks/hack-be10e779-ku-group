// Данные вкладки «Февраль»: нормализация ответа /api/backtest (v1 и v2), сетка календаря, локальные форматтеры.
// Даты — строки YYYY-MM-DD местного времени станции; через Date идём только в UTC, чтобы пояс браузера ничего не сдвинул.

import type { Backtest, BacktestDay } from '../../api/types'
import { addDays } from '../../lib/format'

/** Один выпуск в удобном для экрана виде: целевые сутки D+1/D+2 уже посчитаны. */
export type FebRun = {
  issue: string // дата выпуска D (прогноз сделан в D 23:59)
  d1: string // целевые сутки D+1
  d2: string // сутки D+2
  energyD1: number // часы на номинале за D+1
  energyD2: number | null // v2; в v1 нет
  lowHours: number | null // v2; в v1 нет
  flags: string[]
}

export type FebData = {
  runs: number
  file: string | null
  finalFile: string | null
  generatedAt: string | null
  items: FebRun[] // по возрастанию даты выпуска
  finalHours: NonNullable<Backtest['final_hours']>
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function normalize(b: Backtest): FebData {
  const items = (b.forecasts ?? [])
    .filter((f: BacktestDay) => typeof f.issue_date === 'string' && finite(f.energy_d1))
    .map<FebRun>((f) => ({
      issue: f.issue_date,
      d1: addDays(f.issue_date, 1),
      d2: addDays(f.issue_date, 2),
      energyD1: f.energy_d1,
      energyD2: finite(f.energy_d2) ? f.energy_d2 : null,
      lowHours: finite(f.low_hours) ? f.low_hours : null,
      flags: Array.isArray(f.flags) ? f.flags : [],
    }))
    .sort((a, z) => a.issue.localeCompare(z.issue))
  return {
    runs: finite(b.runs) ? b.runs : items.length,
    file: b.file ?? null,
    finalFile: b.final_file ?? null,
    generatedAt: b.generated_at ?? null,
    items,
    finalHours: Array.isArray(b.final_hours) ? b.final_hours : [],
  }
}

/** Число выпусков по диапазону meta.issue_range (включительно) — для подписей, пока данных нет. */
export function daysBetween(first: string, last: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((toUtc(last) - toUtc(first)) / 86_400_000) + 1
}

export type CalCell = { date: string; day: number; inMonth: boolean }

/** Сетка месяца, понедельник первым, полные недели (соседние месяцы — inMonth=false). */
export function monthGrid(year: number, month: number): CalCell[] {
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const dow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay() // 0 — вс
  const lead = (dow + 6) % 7 // сколько дней до понедельника
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const total = Math.ceil((lead + daysInMonth) / 7) * 7
  const cells: CalCell[] = []
  for (let i = 0; i < total; i++) {
    const date = addDays(first, i - lead)
    const [, m, d] = date.split('-').map(Number)
    cells.push({ date, day: d, inMonth: m === month })
  }
  return cells
}

/** Дни недели, понедельник первым — ключи словаря february.cal.week. */
export const WEEK_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/** "2026-02-10" → «10.02». */
export function ddmm(s: string): string {
  const [, m, d] = s.slice(0, 10).split('-')
  return `${d}.${m}`
}

/** Короткая подпись флага: всё до «:», «—» или «(» — «Высокая неопределённость». */
export function flagHead(f: string): string {
  const head = f.split(/[:—(]/)[0].trim()
  return head || f
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null
}
