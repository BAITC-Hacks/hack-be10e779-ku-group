// D. График прогноза на 48 ч: p50 + интервал p10–p90 (станция) или линия турбины, кривая мощности, ветер 100 м.

import { useMemo } from 'react'
import { useT } from '../../i18n'
import type { Forecast } from '../../api/types'
import type { Theme } from '../../app/shared'
import { EChart } from '../../components/EChart'
import { hourOf, pct } from '../../lib/format'
import { buildChartOption, readChartColors } from './chartOption'
import { dayLabel, kpiFor, objectLabel, type ObjectId } from './model'
import { useMediaQuery } from './hooks'

export function ForecastChart(props: { f: Forecast; object: ObjectId; theme: Theme; invalid: boolean }) {
  const { t, locale } = useT()
  const { f, object, theme } = props
  const narrow = useMediaQuery('(max-width: 767px)')

  // цвета — из CSS-переменных активной темы: пересчитываем при её смене
  const colors = useMemo(() => readChartColors(theme), [theme])
  // подписи серий, легенда и тултип собираются через tr() — пересобираем при смене языка
  const option = useMemo(() => buildChartOption(f, object, colors, narrow, locale), [f, object, colors, narrow, locale])

  const k = kpiFor(f, object)
  const first = f.hours[0]?.time
  const lastT = f.hours[f.hours.length - 1]?.time
  const aria =
    t('forecast.chart.ariaSummary', {
      object: objectLabel(object),
      from: first ? dayLabel(first) : '',
      to: lastT ? dayLabel(lastT) : '',
      peak: pct(k.peakValue),
      peakAt: k.peakTime ? t('forecast.chart.ariaPeakAt', { day: dayLabel(k.peakTime), hour: hourOf(k.peakTime) }) : '',
      calm: k.lowHours ?? '—',
    }) + (props.invalid ? t('forecast.chart.ariaInvalid') : '')

  return (
    <div className={`fc-chart ${props.invalid ? 'fc-chart-invalid' : ''}`}>
      <div className="fc-chart-canvas">
        <EChart option={option} height={narrow ? 300 : 360} theme={theme} ariaLabel={aria} />
      </div>
      {props.invalid && (
        <div className="fc-chart-stamp" aria-hidden>
          {t('forecast.chart.invalid')}
        </div>
      )}
    </div>
  )
}
