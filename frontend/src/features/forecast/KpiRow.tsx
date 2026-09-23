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
      { label: `Завтра, ${dayLabel(d1)}`, value: '—', share: null, caption: 'нет прогноза' },
      { label: `Послезавтра, ${dayLabel(d2)}`, value: '—', share: null, caption: 'нет прогноза' },
      { label: 'Пик мощности', value: '—', share: null, caption: 'нет прогноза' },
      { label: 'Почти без ветра', value: '—', share: null, caption: 'нет прогноза' },
    ]
  } else {
    const k = kpiFor(f, object)
    const energy = (v: number | null, label: string): Item => ({
      label,
      value: pct(v == null ? null : v / 24),
      unit: v == null ? undefined : 'от макс.',
      share: v == null ? null : v / 24,
      caption: `как ${hoursFull(v)} работы на полную мощность`,
    })
    items = [
      energy(k.energyD1, `Завтра, ${dayLabel(d1)}`),
      energy(k.energyD2, `Послезавтра, ${dayLabel(d2)}`),
      {
        label: 'Пик мощности',
        value: pct(k.peakValue),
        share: k.peakValue,
        caption: k.peakTime ? `${dayLabel(k.peakTime)}, ${hourOf(k.peakTime)}` : '—',
      },
      {
        label: 'Почти без ветра',
        value: k.lowHours == null ? '—' : `${k.lowHours} ч`,
        share: k.lowHours == null || k.hoursTotal === 0 ? null : k.lowHours / k.hoursTotal,
        caption: `из ${k.hoursTotal} · мощность ниже 5 %`,
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
