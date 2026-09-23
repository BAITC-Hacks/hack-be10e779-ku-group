// Разбор ответа /api/metrics в вид, удобный вкладке. Поддерживает оба формата:
// v1 — покрытие p10–p90 приходит отдельными строками rows с полем coverage;
// v2 — покрытие в metrics.coverage, калибровка в metrics.calibration (docs/api-contract.md).
// Все числа берутся из ответа, здесь только группировка и производные (отношения ошибок).

import { createElement, Fragment, type ReactNode } from 'react'
import type { MetricRow, Metrics } from '../../api/types'
import { tr, type TKey } from '../../i18n'

export type MethodKind = 'model' | 'curve' | 'persist' | 'other'

export type ErrRow = {
  lead: string
  name: string // название метода как в API
  kind: MethodKind
  hours: number | null
  mae: number
  rmse: number | null
  nmae: number | null
}

export type LeadGroup = {
  lead: string // "D+1" | "D+2"
  rows: ErrRow[] // в порядке: модель, кривая, персистентность, прочие
  best: ErrRow | null // минимальный MAE в группе
  model?: ErrRow
  curve?: ErrRow
  persist?: ErrRow
}

export type Calibration = NonNullable<Metrics['calibration']> & {
  checked_on?: string // есть в outputs/calibration.json, в контракт пока не входит
  calibrated_on?: string[]
}

export type QualityData = {
  holdout: string
  groups: LeadGroup[]
  coverage: { lead: string; value: number }[]
  target: number // целевое покрытие интервала, доля
  calibration: Calibration | null
}

const ORDER: MethodKind[] = ['model', 'curve', 'persist', 'other']

/** Подпись распознанного метода на текущем языке. */
export function kindLabel(kind: MethodKind): string {
  return kind === 'other' ? tr('quality.kind.fallback') : tr(`quality.kind.${kind}`)
}

/** Цвет метода — CSS-переменная (одинаково в таблице, полосах и графике). */
export const KIND_COLOR: Record<MethodKind, string> = {
  model: '--primary',
  curve: '--curve',
  persist: '--text-3',
  other: '--wind',
}

/** Подпись метода для людей. Вариант модели «Модель без gfs_ws100 (…)» → «Наша модель без GFS (ветер 100 м)». */
export function methodLabel(name: string, kind: MethodKind): string {
  if (kind === 'model' && /без/i.test(name)) {
    const src = name.match(/без (\S+)/)?.[1] ?? ''
    const [id, h] = src.split('_ws')
    const source = id.toUpperCase()
    return h ? tr('quality.variant.noSourceHeight', { source, height: h }) : tr('quality.variant.noSource', { source })
  }
  return kind === 'other' ? name : kindLabel(kind)
}

/** "D+1" → «Прогноз на завтра», "D+2" → «Прогноз на послезавтра». */
export function leadHuman(lead: string): string {
  if (lead === 'D+1') return tr('quality.lead.d1')
  if (lead === 'D+2') return tr('quality.lead.d2')
  return lead
}

/** "D+1" → «завтра», "D+2" → «послезавтра» (короткая подпись в таблице). */
export function leadShort(lead: string): string {
  if (lead === 'D+1') return tr('quality.leadShort.d1')
  if (lead === 'D+2') return tr('quality.leadShort.d2')
  return lead
}

export function kindOf(name: string): MethodKind {
  if (/персист/i.test(name)) return 'persist'
  if (/кривая/i.test(name)) return 'curve'
  if (/модел|бустинг|агент/i.test(name)) return 'model'
  return 'other'
}

const byLead = (a: string, b: string) => a.localeCompare(b, 'ru', { numeric: true })

function isCoverageRow(r: MetricRow) {
  return r.coverage != null && r.mae == null
}

/** Целевое покрытие: из калибровки v2, иначе из подписи строки v1 «(цель 0.80)», иначе 0,8 (цель из CASE/контракта). */
function targetOf(m: Metrics): number {
  if (m.calibration?.target != null) return m.calibration.target
  for (const r of m.rows) {
    const hit = isCoverageRow(r) ? /цель\s*([0-9]+[.,][0-9]+)/i.exec(r.model) : null
    if (hit) return Number(hit[1].replace(',', '.'))
  }
  return 0.8
}

export function parseMetrics(m: Metrics): QualityData {
  const errRows: ErrRow[] = (m.rows ?? [])
    .filter((r) => r.mae != null && !isCoverageRow(r))
    .map((r) => ({
      lead: r.lead ?? '—',
      name: r.model,
      kind: kindOf(r.model),
      hours: r.hours ?? null,
      mae: r.mae as number,
      rmse: r.rmse ?? null,
      nmae: r.nmae ?? null,
    }))

  const leads = [...new Set(errRows.map((r) => r.lead))].sort(byLead)
  const groups: LeadGroup[] = leads.map((lead) => {
    const rows = errRows
      .filter((r) => r.lead === lead)
      .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
    const best = rows.reduce<ErrRow | null>((acc, r) => (acc == null || r.mae < acc.mae ? r : acc), null)
    return {
      lead,
      rows,
      best,
      model: rows.find((r) => r.kind === 'model'),
      curve: rows.find((r) => r.kind === 'curve'),
      persist: rows.find((r) => r.kind === 'persist'),
    }
  })

  let coverage: { lead: string; value: number }[] = []
  if (m.coverage && Object.keys(m.coverage).length > 0) {
    coverage = Object.entries(m.coverage)
      .filter(([, v]) => typeof v === 'number')
      .map(([lead, value]) => ({ lead, value }))
  } else {
    coverage = m.rows.filter(isCoverageRow).map((r) => ({ lead: r.lead ?? '—', value: r.coverage as number }))
  }
  coverage.sort((a, b) => byLead(a.lead, b.lead))

  return {
    holdout: m.holdout,
    groups,
    coverage,
    target: targetOf(m),
    calibration: (m.calibration as Calibration | undefined) ?? null,
  }
}

/** Насколько ошибка модели меньше ошибки базы: 1 − MAE_модели / MAE_базы (отрицательное — модель хуже). */
export function gain(model: ErrRow | undefined, base: ErrRow | undefined): number | null {
  if (!model || !base || !(base.mae > 0)) return null
  return 1 - model.mae / base.mae
}

/** Средняя абсолютная ошибка по часам, где есть факт. */
export function meanAbsError(pairs: { pred: number | null | undefined; actual: number | null | undefined }[]): number | null {
  let sum = 0
  let n = 0
  for (const p of pairs) {
    if (p.pred == null || p.actual == null) continue
    sum += Math.abs(p.pred - p.actual)
    n += 1
  }
  return n > 0 ? sum / n : null
}

/** «2026-01» → «январе 2026» / «2026 жылғы қаңтарда» / «January 2026» (подпись месяца проверки калибровки). */
export function monthPrep(ym: string | undefined): string | null {
  const hit = ym ? /^(\d{4})-(\d{2})/.exec(ym) : null
  if (!hit) return null
  const m = Number(hit[2])
  if (!(m >= 1 && m <= 12)) return null
  const month = tr(`quality.months.m${hit[2]}` as TKey)
  return tr('quality.months.template', { month, year: hit[1] })
}

/** Шаблон перевода с плейсхолдерами → ReactNode: rich('на {num} точнее', { num: <b>12 %</b> }). Вёрстка остаётся в компоненте. */
export function rich(s: string, nodes: Record<string, ReactNode>): ReactNode[] {
  return s.split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part)
    return createElement(Fragment, { key: i }, m && m[1] in nodes ? nodes[m[1]] : part)
  })
}
