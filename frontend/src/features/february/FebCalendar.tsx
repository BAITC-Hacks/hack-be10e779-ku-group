// Календарь февраля: ячейка = целевые сутки D+1 (прогноз сделан накануне в 23:59). Клик — открыть выпуск на вкладке «Прогноз».

import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { hoursFull, num, pct } from '../../lib/format'
import { useT } from '../../i18n'
import { ddmm, monthGrid, WEEK_KEYS, type FebRun } from './febData'

export function FebCalendar(props: { items: FebRun[]; year: number; month: number; onOpen: (issue: string) => void }) {
  const { items, year, month, onOpen } = props
  const { t } = useT()
  const byTarget = useMemo(() => new Map(items.map((r) => [r.d1, r])), [items])
  const cells = useMemo(() => monthGrid(year, month), [year, month])

  return (
    <div className="feb-cal">
      <div className="feb-cal-grid" role="group" aria-label={t('february.cal.aria')}>
        {WEEK_KEYS.map((w) => (
          <div key={w} className="feb-cal-wd" aria-hidden>
            {t(`february.cal.week.${w}`)}
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
              <div key={c.date} className="feb-cell feb-cell--none" title={t('february.cal.none', { date: ddmm(c.date) })}>
                <span className="feb-cell-day">{c.day}</span>
                <span className="feb-cell-val muted">—</span>
              </div>
            )
          }
          const share = Math.max(0, Math.min(1, r.energyD1 / 24))
          const warn = r.flags.length > 0
          const tip = [
            t('february.cal.tipHead', { d1: ddmm(r.d1), issue: ddmm(r.issue) }),
            t('february.cal.tipD1', { hours: hoursFull(r.energyD1), share: pct(share) }),
            r.energyD2 != null ? t('february.cal.tipD2', { d2: ddmm(r.d2), hours: hoursFull(r.energyD2) }) : null,
            r.lowHours != null ? t('february.cal.tipLow', { n: num(r.lowHours, 0) }) : null,
            warn ? t('february.cal.tipWarn', { flags: r.flags.join('; ') }) : t('february.cal.tipNone'),
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
                <span className="feb-unit"> {t('february.unitH')}</span>
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
          {t('february.cal.legendBar')}
        </span>
        <span>
          <AlertTriangle size={12} className="feb-warn-ico" aria-hidden /> {t('february.cal.legendWarn')}
        </span>
        <span>{t('february.cal.legendClick')}</span>
      </div>
    </div>
  )
}
