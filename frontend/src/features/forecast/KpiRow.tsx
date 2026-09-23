// C. Четыре KPI: выработка D+1 / D+2 (часы на номинале), пик, часы штиля. Значения нейтральные — не красим «хорошо/плохо».

import type { Forecast } from '../../api/types'
import { Skeleton } from '../../components/ui'
import { hourOf, hoursFull, pct } from '../../lib/format'
import { dayLabel, kpiFor, objectLabel, targetDays, type ObjectId } from './model'

type Item = { label: string; value: string; unit?: string; share: number | null; caption: string }

export function KpiRow(props: { f: Forecast | null; object: ObjectId; issueDate: string; loading: boolean }) {
  const { f, object, issueDate } = props
  const [d1, d2] = targetDays(issueDate)
  const who = objectLabel(object)

  let items: Item[]
  if (!f) {
    items = [
      { label: 'Выработка D+1', value: '—', share: null, caption: `${dayLabel(d1)} · нет прогноза` },
      { label: 'Выработка D+2', value: '—', share: null, caption: `${dayLabel(d2)} · нет прогноза` },
      { label: 'Пик', value: '—', share: null, caption: 'нет прогноза' },
      { label: 'Часы штиля', value: '—', share: null, caption: 'мощность < 5 % · нет прогноза' },
    ]
  } else {
    const k = kpiFor(f, object)
    const energy = (v: number | null, day: string, label: string): Item => ({
      label,
      value: hoursFull(v),
      unit: v == null ? undefined : 'на номинале',
      share: v == null ? null : v / 24,
      caption: `${dayLabel(day)} · ср. загрузка ${pct(v == null ? null : v / 24)}`,
    })
    items = [
      energy(k.energyD1, d1, 'Выработка D+1'),
      energy(k.energyD2, d2, 'Выработка D+2'),
      {
        label: 'Пик',
        value: pct(k.peakValue),
        share: k.peakValue,
        caption: k.peakTime ? `${dayLabel(k.peakTime)}, ${hourOf(k.peakTime)} · p50` : '—',
      },
      {
        label: 'Часы штиля',
        value: k.lowHours == null ? '—' : `${k.lowHours} ч`,
        share: k.lowHours == null || k.hoursTotal === 0 ? null : k.lowHours / k.hoursTotal,
        caption: `из ${k.hoursTotal} · мощность < 5 %`,
      },
    ]
  }

  return (
    <div className={`fc-kpis fc-obj-${object}`} aria-label={`Ключевые показатели · ${who}`}>
      {items.map((it) => (
        <div key={it.label} className="card fc-kpi">
          <div className="fc-kpi-head">
            <span className="eyebrow">{it.label}</span>
            {object !== 'station' && <span className="fc-kpi-who">{who}</span>}
          </div>
          {props.loading ? (
            <>
              <Skeleton height={30} width="60%" />
              <div className="fc-kpi-meter" aria-hidden />
              <Skeleton height={12} width="80%" />
            </>
          ) : (
            <>
              <div className="fc-kpi-value mono">
                {it.value}
                {it.unit && <span className="fc-kpi-unit">{it.unit}</span>}
              </div>
              <div className="fc-kpi-meter" aria-hidden>
                {it.share != null && <span style={{ width: `${Math.min(100, Math.max(0, it.share * 100))}%` }} />}
              </div>
              <div className="fc-kpi-caption">{it.caption}</div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
