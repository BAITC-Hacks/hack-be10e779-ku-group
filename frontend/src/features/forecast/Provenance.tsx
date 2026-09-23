// B. Полоса честности: откуда погода и выпущена ли она до момента прогноза.
// Контракт v2 — time_integrity; v1 — только issued_at/weather_runs (нейтральный бейдж). Проверка — по правилу архива
// Open-Meteo (выпуск за 1–3 суток до часа) плюс расчётная задержка публикации, а не по журналу публикаций — так и подписываем.

import { CloudSun, Filter, Shield, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { Forecast } from '../../api/types'
import { Badge } from '../../components/ui'
import { dateTime } from '../../lib/format'

const BY_DEFINITION = 'по правилу архива Open-Meteo и задержке публикации'

export function Provenance(props: { f: Forecast }) {
  const { f } = props
  const ti = f.time_integrity
  const excluded = f.excluded_sources ?? []
  const runsHint = [f.weather_runs, ti?.rule].filter(Boolean).join('\n')

  const run = ti?.latest_weather_run ?? ti?.latest_weather_run_used
  const published = ti?.latest_run_published_by
  const whenLabel = published ? `опубликован к ${dateTime(published)}` : run ? `выпуск ${dateTime(run)}` : ''

  let integrity
  if (ti && ti.ok) {
    integrity = (
      <Badge tone="ok" icon={<ShieldCheck size={14} />} title={`${runsHint}\nПроверка ${BY_DEFINITION}.`}>
        <span className="fc-wrap">
          Погода опубликована до момента прогноза ✓
          {run && (
            <>
              {' · последний выпуск '}
              <span className="mono">{dateTime(run)}</span>
            </>
          )}
          {published && (
            <>
              {', опубликован к '}
              <span className="mono">{dateTime(published)}</span>
            </>
          )}
        </span>
      </Badge>
    )
  } else if (ti && !ti.ok) {
    integrity = (
      <Badge tone="error" icon={<ShieldAlert size={14} />} title={runsHint}>
        <span className="fc-wrap">
          Погода ({whenLabel || 'выпуск неизвестен'}) позже момента прогноза ({dateTime(ti.issued_at)}) — прогноз недействителен
        </span>
      </Badge>
    )
  } else {
    integrity = (
      <Badge tone="neutral" icon={<Shield size={14} />} title={f.weather_runs}>
        <span className="fc-wrap">
          Архивный прогноз погоды · выпуски не позже <span className="mono">{dateTime(f.issued_at)}</span>
        </span>
      </Badge>
    )
  }

  return (
    <div className="fc-prov" aria-label="Происхождение погоды">
      <div className="fc-prov-main">
        {integrity}
        <span className="fc-prov-note">{BY_DEFINITION}</span>
      </div>
      <Badge tone="neutral" icon={<CloudSun size={14} />} title={f.weather_runs}>
        <span className="fc-wrap">Погода: {f.weather_source}</span>
      </Badge>
      {excluded.length > 0 && (
        <Badge tone="info" icon={<Filter size={14} />} title="Источники погоды, которые агент исключил (причина — в шаге «Оценка источников погоды»)">
          <span className="fc-wrap">
            Исключены: <span className="mono">{excluded.join(', ')}</span>
          </span>
        </Badge>
      )}
    </div>
  )
}
