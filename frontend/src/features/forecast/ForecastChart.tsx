// D. График прогноза на 48 ч: p50 + интервал p10–p90 (станция) или линия турбины, кривая мощности, ветер 100 м.

import { useMemo } from 'react'
import type { Forecast } from '../../api/types'
import type { Theme } from '../../app/shared'
import { EChart } from '../../components/EChart'
import { hourOf, pct } from '../../lib/format'
import { buildChartOption, readChartColors } from './chartOption'
import { dayLabel, kpiFor, objectLabel, type ObjectId } from './model'
import { useMediaQuery } from './hooks'

export function ForecastChart(props: { f: Forecast; object: ObjectId; theme: Theme; invalid: boolean }) {
  const { f, object, theme } = props
  const narrow = useMediaQuery('(max-width: 767px)')

  // цвета — из CSS-переменных активной темы: пересчитываем при её смене
  const colors = useMemo(() => readChartColors(theme), [theme])
  const option = useMemo(() => buildChartOption(f, object, colors, narrow), [f, object, colors, narrow])

  const k = kpiFor(f, object)
  const first = f.hours[0]?.time
  const lastT = f.hours[f.hours.length - 1]?.time
  const aria =
    `График прогноза (${objectLabel(object)}) на ${first ? dayLabel(first) : ''}–${lastT ? dayLabel(lastT) : ''}: ` +
    `пик ${pct(k.peakValue)}${k.peakTime ? ` в ${dayLabel(k.peakTime)} ${hourOf(k.peakTime)}` : ''}, ` +
    `часов штиля ${k.lowHours ?? '—'}` +
    (props.invalid ? '. Прогноз недействителен: погода выпущена позже момента прогноза' : '')

  return (
    <div className={`fc-chart ${props.invalid ? 'fc-chart-invalid' : ''}`}>
      <div className="fc-chart-canvas">
        <EChart option={option} height={narrow ? 300 : 360} theme={theme} ariaLabel={aria} />
      </div>
      {props.invalid && (
        <div className="fc-chart-stamp" aria-hidden>
          Недействителен
        </div>
      )}
    </div>
  )
}
