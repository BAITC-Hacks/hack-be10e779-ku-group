// H. Почасовая таблица (свёрнута по умолчанию). Колонка выбранного объекта подсвечена.

import { Table } from 'lucide-react'
import type { Forecast } from '../../api/types'
import { dateTime, num, pct } from '../../lib/format'
import { useT } from '../../i18n'
import { hasActual, type ObjectId } from './model'

export function HourlyTable(props: { f: Forecast; object: ObjectId }) {
  const { t } = useT()
  const { f, object } = props
  const actual = hasActual(f)
  const hl = (o: ObjectId) => (object === o ? 'r fc-col-active' : 'r')

  return (
    <details className="card fc-table">
      <summary>
        <Table size={16} aria-hidden /> {t('forecast.table.summary')}{' '}
        <span className="muted">{t('forecast.table.summaryNote', { count: f.hours.length })}</span>
      </summary>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>{t('forecast.table.time')}</th>
              <th>{t('forecast.table.day')}</th>
              <th className={hl('station')}>{t('forecast.table.forecast')}</th>
              <th className="r">{t('forecast.table.range')}</th>
              <th className="r">{t('forecast.table.curve')}</th>
              <th className={hl('t1')}>{t('forecast.objects.t1Short')}</th>
              <th className={hl('t2')}>{t('forecast.objects.t2Short')}</th>
              <th className="r">{t('forecast.table.wind')}</th>
              {actual && <th className="r">{t('forecast.table.actual')}</th>}
            </tr>
          </thead>
          <tbody>
            {f.hours.map((h) => (
              <tr key={h.time} className={h.lead_day === 2 ? 'fc-row-d2' : undefined}>
                <td className="mono">{dateTime(h.time)}</td>
                <td>D+{h.lead_day}</td>
                <td className={`mono ${hl('station')}`}>{pct(h.p50)}</td>
                <td className="mono r">
                  {pct(h.p10)} – {pct(h.p90)}
                </td>
                <td className="mono r">{pct(h.curve)}</td>
                <td className={`mono ${hl('t1')}`}>{pct(h.t1)}</td>
                <td className={`mono ${hl('t2')}`}>{pct(h.t2)}</td>
                <td className="mono r">{h.wind_100m == null ? '—' : num(h.wind_100m)}</td>
                {actual && <td className="mono r">{pct(h.actual)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
