// «Прогноз против факта» на январе 2026: выпуск D → сутки D+1 и D+2.
// Есть /api/holdout (P1) — факт, p50 с интервалом и кривая мощности; нет — только факт станции из /api/history.

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { getHistory, getHoldout } from '../../api/endpoints'
import type { HistoryPoint, HoldoutPoint } from '../../api/types'
import type { Theme } from '../../app/shared'
import { EChart } from '../../components/EChart'
import { Card, Empty, Notice, Skeleton } from '../../components/ui'
import { addDays, dateRu, pct } from '../../lib/format'
import { historyOption, holdoutOption } from './charts'
import { meanAbsError } from './model'

// выпуски с фактом на обоих сутках: 01.01 … 29.01 (docs/api-contract.md, /api/holdout)
const FIRST = '2026-01-01'
const LAST = '2026-01-29'
const DEFAULT_DATE = '2026-01-20'

type View =
  | { kind: 'holdout'; hours: HoldoutPoint[]; mae: { model: number | null; curve: number | null } }
  | { kind: 'history'; points: HistoryPoint[] }
  | { kind: 'error'; message: string }

async function load(date: string): Promise<View> {
  const h = await getHoldout(date)
  if (h && Array.isArray(h.hours) && h.hours.length > 0) {
    const mae = {
      model: h.mae?.model ?? meanAbsError(h.hours.map((x) => ({ pred: x.p50, actual: x.actual }))),
      curve: h.mae?.curve ?? meanAbsError(h.hours.map((x) => ({ pred: x.curve, actual: x.actual }))),
    }
    return { kind: 'holdout', hours: h.hours, mae }
  }
  const points = await getHistory(addDays(date, 1), addDays(date, 2))
  return { kind: 'history', points }
}

export function HoldoutCard(props: { theme: Theme }) {
  const [date, setDate] = useState(DEFAULT_DATE)
  const [attempt, setAttempt] = useState(0)
  const key = `${date}#${attempt}`
  const [result, setResult] = useState<{ key: string; view: View } | null>(null)

  useEffect(() => {
    let alive = true
    load(date)
      .then((view) => alive && setResult({ key, view }))
      .catch((e: unknown) =>
        alive && setResult({ key, view: { kind: 'error', message: e instanceof Error ? e.message : String(e) } }),
      )
    return () => {
      alive = false
    }
  }, [date, key])

  const view = result?.key === key ? result.view : null
  const option = useMemo(() => {
    if (view?.kind === 'holdout') return holdoutOption(view.hours, props.theme)
    if (view?.kind === 'history') return historyOption(view.points, props.theme)
    return null
  }, [view, props.theme])

  const d1 = addDays(date, 1)
  const d2 = addDays(date, 2)
  const setClamped = (d: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= FIRST && d <= LAST) setDate(d)
  }
  const hasActual = view?.kind === 'history' ? view.points.some((p) => p.actual != null) : true

  return (
    <Card
      className="q-holdout"
      eyebrow="Январь 2026 · факт есть"
      title="Прогноз против факта"
      actions={
        <div className="q-datepick" role="group" aria-label="Дата выпуска прогноза">
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setClamped(addDays(date, -1))}
            disabled={date <= FIRST}
            aria-label="Предыдущий день"
          >
            <ChevronLeft size={16} />
          </button>
          <label className="q-date">
            <span className="q-sr-only">Выпуск прогноза</span>
            <input
              type="date"
              min={FIRST}
              max={LAST}
              value={date}
              onChange={(e) => setClamped(e.target.value)}
              className="mono"
            />
          </label>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setClamped(addDays(date, 1))}
            disabled={date >= LAST}
            aria-label="Следующий день"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      }
    >
      <p className="muted small q-holdout-sub">
        Прогноз сделан <b className="mono">{dateRu(date)} 23:59</b> на <span className="mono">{dateRu(d1)}</span> и{' '}
        <span className="mono">{dateRu(d2)}</span> · время станции UTC+5
      </p>

      {view == null && <Skeleton height={300} />}

      {view?.kind === 'error' && (
        <Notice
          tone="error"
          action={
            <button className="btn btn-sm" onClick={() => setAttempt((n) => n + 1)}>
              <RefreshCw size={14} /> Повторить
            </button>
          }
        >
          Не удалось загрузить данные за {dateRu(d1)}–{dateRu(d2)}: {view.message}
        </Notice>
      )}

      {view?.kind === 'holdout' && (
        <div className="q-holdout-mae" aria-live="polite">
          <span className="eyebrow">Средняя ошибка за эти 48 ч, % от макс.</span>
          <span>
            модель <b className="mono">{pct(view.mae.model, 1)}</b>
          </span>
          <span className="muted">
            простой расчёт по ветру <b className="mono">{pct(view.mae.curve, 1)}</b>
          </span>
        </div>
      )}

      {view?.kind === 'history' && (
        <Notice tone="info">
          Сравнение прогноза с фактом по часам пока недоступно — показан только факт станции.
        </Notice>
      )}

      {option && hasActual && (
        <EChart
          option={option}
          height={300}
          theme={props.theme}
          ariaLabel={
            view?.kind === 'holdout'
              ? `Прогноз и факт выработки станции за ${dateRu(d1)}–${dateRu(d2)}, % номинала`
              : `Фактическая выработка станции и измеренный ветер за ${dateRu(d1)}–${dateRu(d2)}`
          }
        />
      )}
      {view?.kind === 'history' && !hasActual && <Empty title="За эти сутки нет полных часов факта" />}
    </Card>
  )
}
