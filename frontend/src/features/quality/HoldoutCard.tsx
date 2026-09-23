// «Прогноз против факта» на январе 2026: выпуск D → сутки D+1 и D+2.
// Есть /api/holdout (P1) — факт, p50 с интервалом и кривая мощности; нет — только факт станции из /api/history.

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { getHistory, getHoldout } from '../../api/endpoints'
import type { HistoryPoint, HoldoutPoint } from '../../api/types'
import type { Theme } from '../../app/shared'
import { EChart } from '../../components/EChart'
import { Card, Empty, Notice, Skeleton } from '../../components/ui'
import { useT } from '../../i18n'
import { addDays, dateRu, pct } from '../../lib/format'
import { historyOption, holdoutOption } from './charts'
import { meanAbsError, rich } from './model'

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
  const { t, locale } = useT()
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
    if (view?.kind === 'holdout') return holdoutOption(view.hours, props.theme, locale)
    if (view?.kind === 'history') return historyOption(view.points, props.theme, locale)
    return null
  }, [view, props.theme, locale])

  const d1 = addDays(date, 1)
  const d2 = addDays(date, 2)
  const setClamped = (d: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= FIRST && d <= LAST) setDate(d)
  }
  const hasActual = view?.kind === 'history' ? view.points.some((p) => p.actual != null) : true

  return (
    <Card
      className="q-holdout"
      eyebrow={t('quality.holdout.eyebrow')}
      title={t('quality.holdout.title')}
      actions={
        <div className="q-datepick" role="group" aria-label={t('quality.holdout.dateAria')}>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setClamped(addDays(date, -1))}
            disabled={date <= FIRST}
            aria-label={t('quality.holdout.prev')}
          >
            <ChevronLeft size={16} />
          </button>
          <label className="q-date">
            <span className="q-sr-only">{t('quality.holdout.issue')}</span>
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
            aria-label={t('quality.holdout.next')}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      }
    >
      <p className="muted small q-holdout-sub">
        {rich(t('quality.holdout.sub'), {
          issued: <b className="mono">{dateRu(date)} 23:59</b>,
          d1: <span className="mono">{dateRu(d1)}</span>,
          d2: <span className="mono">{dateRu(d2)}</span>,
        })}
      </p>

      {view == null && <Skeleton height={300} />}

      {view?.kind === 'error' && (
        <Notice
          tone="error"
          action={
            <button className="btn btn-sm" onClick={() => setAttempt((n) => n + 1)}>
              <RefreshCw size={14} /> {t('quality.holdout.retry')}
            </button>
          }
        >
          {t('quality.holdout.loadError', { from: dateRu(d1), to: dateRu(d2), error: view.message })}
        </Notice>
      )}

      {view?.kind === 'holdout' && (
        <div className="q-holdout-mae" aria-live="polite">
          <span className="eyebrow">{t('quality.holdout.maeTitle')}</span>
          <span>{rich(t('quality.holdout.maeModel'), { value: <b className="mono">{pct(view.mae.model, 1)}</b> })}</span>
          <span className="muted">
            {rich(t('quality.holdout.maeCurve'), { value: <b className="mono">{pct(view.mae.curve, 1)}</b> })}
          </span>
        </div>
      )}

      {view?.kind === 'history' && (
        <Notice tone="info">
          {t('quality.holdout.historyOnly')}
        </Notice>
      )}

      {option && hasActual && (
        <EChart
          option={option}
          height={300}
          theme={props.theme}
          ariaLabel={
            view?.kind === 'holdout'
              ? t('quality.holdout.ariaHoldout', { from: dateRu(d1), to: dateRu(d2) })
              : t('quality.holdout.ariaHistory', { from: dateRu(d1), to: dateRu(d2) })
          }
        />
      )}
      {view?.kind === 'history' && !hasActual && <Empty title={t('quality.holdout.emptyActual')} />}
    </Card>
  )
}
