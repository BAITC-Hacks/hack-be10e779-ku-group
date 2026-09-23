// B. Полоса честности: откуда погода и выпущена ли она до момента прогноза.
// Контракт v2 — time_integrity; v1 — только issued_at/weather_runs (нейтральный бейдж). Проверка — по правилу архива
// Open-Meteo (выпуск за 1–3 суток до часа) плюс расчётная задержка публикации, а не по журналу публикаций — так и подписываем.

import { useState } from 'react'
import { CloudSun, Filter, Shield, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { Forecast, WeatherRetrieval } from '../../api/types'
import { Badge } from '../../components/ui'
import { dateTime, num } from '../../lib/format'

/** "gfs_ws100" → «GFS (ветер 100 м)». */
function prettySource(s: string): string {
  const [id, h] = s.split('_ws')
  const name = id === 'best_match' ? 'Open-Meteo' : id.toUpperCase()
  return h ? `${name} (ветер ${h} м)` : name
}

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
      {f.weather_retrieval ? (
        <Retrieval r={f.weather_retrieval} />
      ) : (
        <Badge tone="neutral" icon={<CloudSun size={14} />} title={`${f.weather_source}\n${f.weather_runs}`}>
          <span className="fc-wrap">Погода: архив Open-Meteo, 7 источников прогноза</span>
        </Badge>
      )}
      {excluded.length > 0 && (
        <Badge tone="info" icon={<Filter size={14} />} title="Источники погоды, которые агент исключил: пропуски данных на часы прогноза (подробно — в шаге «Оценка источников погоды»)">
          <span className="fc-wrap">
            Агент отбросил неполные данные: {excluded.map(prettySource).join(', ')}
          </span>
        </Badge>
      )}
    </div>
  )
}

/** Как агент получил погоду: по сети или из локального архива (weather_retrieval). По клику — таблица источников. */
function Retrieval(props: { r: WeatherRetrieval }) {
  const { r } = props
  const [open, setOpen] = useState(false)
  const n = r.sources.length
  const hash = r.snapshot_hash ? r.snapshot_hash.slice(0, 8) : null
  const label =
    r.origin === 'network'
      ? `Погода получена агентом по сети: ${n} источников`
      : r.origin === 'archive'
        ? `Погода из локального архива: ${n} источников (сети нет)`
        : `Погода: по сети ${r.network_ok}, из архива ${r.archive_fallback}`
  return (
    <div className="fc-retr">
      <button
        type="button"
        className={`badge ${r.origin === 'network' ? 'badge-ok' : 'badge-warn'} fc-retr-btn`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Показать источники"
      >
        <CloudSun size={14} />
        <span className="fc-wrap">
          {label}
          {hash && (
            <>
              {' · снимок '}
              <span className="mono">{hash}</span>
            </>
          )}
        </span>
      </button>
      {open && (
        <div className="table-wrap fc-retr-table">
          <table className="data">
            <thead>
              <tr>
                <th>Источник</th>
                <th>Откуда</th>
                <th className="r">Часов</th>
                <th className="r" title="Максимальное расхождение с сохранённым архивом, м/с">Сверка с архивом</th>
              </tr>
            </thead>
            <tbody>
              {r.sources.map((s) => (
                <tr key={s.source}>
                  <td className="mono">{s.source}</td>
                  <td>{s.origin === 'network' ? 'сеть' : `архив${s.reason ? ` (${s.reason})` : ''}`}</td>
                  <td className="r">{s.hours ?? '—'}</td>
                  <td className="r">{s.max_abs_diff_vs_archive == null ? '—' : `${num(s.max_abs_diff_vs_archive, 2)} м/с`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.input_updated != null && (
            <p className="small muted">
              {r.input_updated ? 'Полученные данные отличаются от архива — вход обновился.' : 'Полученные данные совпадают с архивом.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
