// Покрытие интервала p10–p90 против цели + результат конформной калибровки (если бэкенд её отдаёт).

import { AlertTriangle, CircleCheck } from 'lucide-react'
import { useT } from '../../i18n'
import { pct } from '../../lib/format'
import { monthPrep, rich, type Calibration } from './model'

function CoverBar(props: { label: string; value: number; target: number; muted?: boolean }) {
  const { t } = useT()
  const reached = props.value >= props.target
  const w = (v: number) => `${Math.max(0, Math.min(1, v)) * 100}%`
  return (
    <div className={`q-cover ${props.muted ? 'is-muted' : ''}`}>
      <span className="q-cover-label mono">{props.label}</span>
      <span
        className="q-cover-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(props.value * 1000) / 10}
        aria-valuetext={t('quality.coverage.valueText', { value: pct(props.value, 1), target: pct(props.target) })}
        aria-label={t('quality.coverage.aria', { label: props.label })}
      >
        <span className={`q-cover-fill ${reached ? 'is-ok' : ''}`} style={{ width: w(props.value) }} />
        <span className="q-cover-target" style={{ left: w(props.target) }} aria-hidden>
          <span className="q-cover-target-label">{t('quality.coverage.target', { value: pct(props.target) })}</span>
        </span>
      </span>
      <span className="q-cover-val mono">{pct(props.value, 1)}</span>
    </div>
  )
}

/** ["2025-10", "2025-12"] → «10.2025–12.2025». */
function monthsSpan(ms: string[] | undefined): string | null {
  if (!ms || ms.length === 0) return null
  const f = (s: string) => {
    const [y, m] = s.split('-')
    return m ? `${m}.${y}` : s
  }
  return ms.length === 1 ? f(ms[0]) : `${f(ms[0])}–${f(ms[ms.length - 1])}`
}

export function CoverageBlock(props: {
  coverage: { lead: string; value: number }[]
  target: number
  holdout: string
  calibration: Calibration | null
}) {
  const { t } = useT()
  const cal = props.calibration
  const calTarget = cal?.target ?? props.target
  const month = monthPrep(cal?.checked_on) ?? monthPrep('2026-01')
  const built = monthsSpan(cal?.calibrated_on)

  return (
    <div className="q-coverage">
      <p className="muted small q-lead-text">
        {t('quality.coverage.intro', { target: pct(props.target) })}
      </p>

      {props.coverage.length > 0 ? (
        <div className="q-cover-group">
          <div className="eyebrow">{t('quality.coverage.raw', { period: props.holdout })}</div>
          {props.coverage.map((c) => (
            <CoverBar key={c.lead} label={c.lead} value={c.value} target={props.target} />
          ))}
        </div>
      ) : (
        <p className="muted small">{t('quality.coverage.noCoverage')}</p>
      )}

      {cal ? (
        <div className="q-cover-group">
          <div className="eyebrow">{t('quality.coverage.calTitle', { month: month ?? '' })}</div>
          <CoverBar label={t('quality.coverage.before')} value={cal.coverage_before} target={calTarget} muted />
          <CoverBar label={t('quality.coverage.after')} value={cal.coverage_after} target={calTarget} />
          <p className="q-cal-line">
            {rich(t('quality.coverage.calLine', { month: month ?? '' }), {
              before: <b className="mono">{pct(cal.coverage_before, 1)}</b>,
              after: <b className="mono">{pct(cal.coverage_after, 1)}</b>,
            })}
          </p>
          <p className="muted small">
            {t('quality.coverage.price', { before: pct(cal.width_before, 1), after: pct(cal.width_after, 1) })}
            {built && <> {t('quality.coverage.built', { months: built })}</>}
            {cal.method && (
              <>
                {' '}
                {rich(t('quality.coverage.method'), { method: <span className="mono">{cal.method}</span> })}
              </>
            )}
          </p>
          {cal.coverage_after < calTarget ? (
            <p className="q-honest">
              <AlertTriangle size={16} aria-hidden />
              <span>
                {t('quality.coverage.short', {
                  target: pct(calTarget),
                  miss: pct(1 - cal.coverage_after),
                  expected: pct(1 - calTarget),
                })}
              </span>
            </p>
          ) : (
            <p className="q-honest is-ok">
              <CircleCheck size={16} aria-hidden />
              <span>{t('quality.coverage.reached')}</span>
            </p>
          )}
        </div>
      ) : (
        <p className="muted small">
          {t('quality.coverage.noCal')}
        </p>
      )}
    </div>
  )
}
