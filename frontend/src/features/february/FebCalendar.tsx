// Календарь февраля: ячейка = целевые сутки D+1 (прогноз сделан накануне в 23:59). Клик — открыть выпуск на вкладке «Прогноз».

import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { hoursFull, num, pct } from '../../lib/format'
import { ddmm, monthGrid, WEEK_RU, type FebRun } from './febData'

export function FebCalendar(props: { items: FebRun[]; year: number; month: number; onOpen: (issue: string) => void }) {
  const { items, year, month, onOpen } = props
  const byTarget = useMemo(() => new Map(items.map((r) => [r.d1, r])), [items])
  const cells = useMemo(() => monthGrid(year, month), [year, month])

  return (
    <div className="feb-cal">
      <div className="feb-cal-grid" role="group" aria-label="Прогноз выработки по дням месяца">
        {WEEK_RU.map((w) => (
          <div key={w} className="feb-cal-wd" aria-hidden>
            {w}
          </div>
        ))}
        {cells.map((c) => {
          const r = c.inMonth ? byTarget.get(c.date) : undefined
          if (!c.inMonth) {
            return (
              <div key={c.date} className="feb-cell feb-cell--out" aria-hidden>
                <span className="feb-cell-day">{c.day}</span>
              </div>
            )
          }
          if (!r) {
            return (
              <div key={c.date} className="feb-cell feb-cell--none" title={`${ddmm(c.date)}: выпуска с прогнозом на эти сутки нет`}>
                <span className="feb-cell-day">{c.day}</span>
                <span className="feb-cell-val muted">—</span>
              </div>
            )
          }
          const share = Math.max(0, Math.min(1, r.energyD1 / 24))
          const warn = r.flags.length > 0
          const tip = [
            `Прогноз на ${ddmm(r.d1)} от ${ddmm(r.issue)} 23:59`,
            `D+1: ${hoursFull(r.energyD1)} на номинале (${pct(share)} загрузки)`,
            r.energyD2 != null ? `D+2 (${ddmm(r.d2)}): ${hoursFull(r.energyD2)}` : null,
            r.lowHours != null ? `штиль: ${num(r.lowHours, 0)} ч из 48` : null,
            warn ? `предупреждения: ${r.flags.join('; ')}` : 'замечаний нет',
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <button
              key={c.date}
              type="button"
              className={`feb-cell${warn ? ' feb-cell--warn' : ''}`}
              title={tip}
              aria-label={tip}
              onClick={() => onOpen(r.issue)}
            >
              <span className="feb-cell-day">{c.day}</span>
              {warn && <AlertTriangle size={12} className="feb-cell-flag" aria-hidden />}
              <span className="feb-cell-val mono">
                {num(r.energyD1)}
                <span className="feb-unit"> ч</span>
              </span>
              <span className="feb-cell-bar" aria-hidden>
                <span style={{ width: `${share * 100}%` }} />
              </span>
            </button>
          )
        })}
      </div>
      <div className="feb-legend small muted">
        <span>
          <span className="feb-legend-bar" aria-hidden>
            <span />
          </span>
          доля суток на номинале (0–24 ч)
        </span>
        <span>
          <AlertTriangle size={12} className="feb-warn-ico" aria-hidden /> есть предупреждения анализа
        </span>
        <span>ячейка — сутки прогноза, клик — открыть выпуск</span>
      </div>
    </div>
  )
}
