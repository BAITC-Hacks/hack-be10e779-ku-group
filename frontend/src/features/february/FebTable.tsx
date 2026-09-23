// Таблица выпусков февраля: строка = один выпуск (D, 23:59) → сутки D+1 и D+2. Клик по строке или «Открыть» — вкладка «Прогноз».

import { AlertTriangle, ArrowUpRight } from 'lucide-react'
import { dateRu, hoursFull, num, pct, weekday } from '../../lib/format'
import { ddmm, flagHead, type FebRun } from './febData'

export function FebTable(props: { items: FebRun[]; onOpen: (issue: string) => void }) {
  const { items, onOpen } = props
  const hasD2 = items.some((r) => r.energyD2 != null)
  const hasLow = items.some((r) => r.lowHours != null)

  return (
    <div className="table-wrap">
      <table className="data feb-table">
        <thead>
          <tr>
            <th>Выпуск</th>
            <th>Прогноз на</th>
            <th className="r">Выработка D+1</th>
            <th className="r">D+2</th>
            <th className="r" title="Часов с мощностью ниже 5 % номинала из 48">
              Штиль, ч
            </th>
            <th>Предупреждения</th>
            <th aria-label="Действие" />
          </tr>
        </thead>
        <tbody>
          {items.map((r) => {
            const heads = [...new Set(r.flags.map(flagHead))]
            return (
              <tr key={r.issue} className={`feb-row${r.flags.length ? ' feb-row--warn' : ''}`} onClick={() => onOpen(r.issue)}>
                <td className="mono">
                  {dateRu(r.issue)} <span className="muted">23:59</span>
                </td>
                <td>
                  <span className="mono">
                    {ddmm(r.d1)}–{ddmm(r.d2)}
                  </span>{' '}
                  <span className="muted small">{weekday(r.d1)}</span>
                </td>
                <td className="r mono">
                  {hoursFull(r.energyD1)} <span className="muted small">{pct(r.energyD1 / 24)}</span>
                </td>
                <td className="r mono">{hasD2 && r.energyD2 != null ? hoursFull(r.energyD2) : '—'}</td>
                <td className="r mono">{hasLow && r.lowHours != null ? num(r.lowHours, 0) : '—'}</td>
                <td className="feb-flags" title={r.flags.length ? r.flags.join('\n') : undefined}>
                  {r.flags.length ? (
                    <span className="feb-flags-inner">
                      <AlertTriangle size={13} className="feb-warn-ico" aria-hidden />
                      <span className="mono">{r.flags.length}</span>
                      <span className="feb-flags-text">
                        {heads[0]}
                        {heads.length > 1 && `; ${heads.slice(1).join('; ')}`}
                      </span>
                    </span>
                  ) : (
                    <span className="muted">нет</span>
                  )}
                </td>
                <td className="r">
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpen(r.issue)
                    }}
                    aria-label={`Открыть выпуск ${dateRu(r.issue)} на вкладке «Прогноз»`}
                  >
                    Открыть <ArrowUpRight size={14} aria-hidden />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
