// C. Четыре KPI: выработка D+1 / D+2 (часы на номинале), пик, часы штиля. Значения нейтральные — не красим «хорошо/плохо».

import type { Forecast } from '../../api/types'
import { Skeleton } from '../../components/ui'
import { useT } from '../../i18n'
import { hourOf, hoursFull, pct } from '../../lib/format'
import { dayLabel, kpiFor, objectLabel, targetDays, type ObjectId } from './model'

type Item = { label: string; value: string; unit?: string; share: number | null; caption: string }

export function KpiRow(props: { f: Forecast | null; object: ObjectId; issueDate: string; loading: boolean }) {
  const { t } = useT()
  const { f, object, issueDate } = props
  const [d1, d2] = targetDays(issueDate)
  const who = objectLabel(object)

  let items: Item[]
  if (!f) {
    items = [
      { label: t('forecast.kpi.tomorrow', { day: dayLabel(d1) }), value: '—', share: null, caption: t('forecast.kpi.noForecast') },
      { label: t('forecast.kpi.dayAfter', { day: dayLabel(d2) }), value: '—', share: null, caption: t('forecast.kpi.noForecast') },
      { label: t('forecast.kpi.peak'), value: '—', share: null, caption: t('forecast.kpi.noForecast') },
      { label: t('forecast.kpi.calm'), value: '—', share: null, caption: t('forecast.kpi.noForecast') },
    ]
  } else {
    const k = kpiFor(f, object)
    const energy = (v: number | null, label: string): Item => ({
      label,
      value: pct(v == null ? null : v / 24),
      unit: v == null ? undefined : t('forecast.kpi.ofMax'),
      share: v == null ? null : v / 24,
      caption: t('forecast.kpi.fullLoad', { hours: hoursFull(v) }),
    })
    items = [
      energy(k.energyD1, t('forecast.kpi.tomorrow', { day: dayLabel(d1) })),
      energy(k.energyD2, t('forecast.kpi.dayAfter', { day: dayLabel(d2) })),
      {
        label: t('forecast.kpi.peak'),
        value: pct(k.peakValue),
        share: k.peakValue,
        caption: k.peakTime ? `${dayLabel(k.peakTime)}, ${hourOf(k.peakTime)}` : '—',
      },
      {
        label: t('forecast.kpi.calm'),
        value: k.lowHours == null ? '—' : t('forecast.kpi.calmValue', { count: k.lowHours }),
        share: k.lowHours == null || k.hoursTotal === 0 ? null : k.lowHours / k.hoursTotal,
        caption: t('forecast.kpi.calmCaption', { total: k.hoursTotal }),
      },
    ]
  }

  return (
    <div className={`fc-kpis fc-obj-${object}`} aria-label={t('forecast.kpi.aria', { who })}>
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
