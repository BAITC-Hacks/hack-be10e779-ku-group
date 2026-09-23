// Покрытие интервала p10–p90 против цели + результат конформной калибровки (если бэкенд её отдаёт).

import { AlertTriangle, CircleCheck } from 'lucide-react'
import { pct } from '../../lib/format'
import { monthPrep, type Calibration } from './model'

function CoverBar(props: { label: string; value: number; target: number; muted?: boolean }) {
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
        aria-valuetext={`${pct(props.value, 1)} при цели ${pct(props.target)}`}
        aria-label={`Покрытие ${props.label}`}
      >
        <span className={`q-cover-fill ${reached ? 'is-ok' : ''}`} style={{ width: w(props.value) }} />
        <span className="q-cover-target" style={{ left: w(props.target) }} aria-hidden>
          <span className="q-cover-target-label">цель {pct(props.target)}</span>
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
  const cal = props.calibration
  const calTarget = cal?.target ?? props.target
  const month = monthPrep(cal?.checked_on) ?? 'январе 2026'
  const built = monthsSpan(cal?.calibrated_on)

  return (
    <div className="q-coverage">
      <p className="muted small q-lead-text">
        Доля часов, когда настоящая выработка попала внутрь вероятного диапазона (p10–p90). Цель — {pct(props.target)} часов.
      </p>

      {props.coverage.length > 0 ? (
        <div className="q-cover-group">
          <div className="eyebrow">Без калибровки · {props.holdout}</div>
          {props.coverage.map((c) => (
            <CoverBar key={c.lead} label={c.lead} value={c.value} target={props.target} />
          ))}
        </div>
      ) : (
        <p className="muted small">Покрытие интервала в метриках не передано.</p>
      )}

      {cal ? (
        <div className="q-cover-group">
          <div className="eyebrow">Конформная калибровка · проверка на {month}</div>
          <CoverBar label="до" value={cal.coverage_before} target={calTarget} muted />
          <CoverBar label="после" value={cal.coverage_after} target={calTarget} />
          <p className="q-cal-line">
            После конформной калибровки на {month}: <b className="mono">{pct(cal.coverage_before, 1)}</b> →{' '}
            <b className="mono">{pct(cal.coverage_after, 1)}</b>
          </p>
          <p className="muted small">
            Цена — интервал шире: в среднем {pct(cal.width_before, 1)} → {pct(cal.width_after, 1)} номинала.
            {built && <> Поправка построена на {built} и проверена на месяце, которого не видела.</>}
            {cal.method && (
              <>
                {' '}
                Метод: <span className="mono">{cal.method}</span>.
              </>
            )}
          </p>
          {cal.coverage_after < calTarget ? (
            <p className="q-honest">
              <AlertTriangle size={16} aria-hidden />
              <span>
                До цели {pct(calTarget)} не дотянули: факт выходит за границы интервала в {pct(1 - cal.coverage_after)}{' '}
                часов вместо {pct(1 - calTarget)}. Интервал стоит читать как ориентир неуверенности, а не как точную
                вероятность.
              </span>
            </p>
          ) : (
            <p className="q-honest is-ok">
              <CircleCheck size={16} aria-hidden />
              <span>После калибровки покрытие достигло цели.</span>
            </p>
          )}
        </div>
      ) : (
        <p className="muted small">
          Данных о калибровке интервала в ответе нет — показано покрытие исходного квантильного интервала.
        </p>
      )}
    </div>
  )
}
