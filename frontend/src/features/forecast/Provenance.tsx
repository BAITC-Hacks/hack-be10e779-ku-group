// B. Полоса честности: откуда погода и выпущена ли она до момента прогноза.
// Контракт v2 — time_integrity; v1 — только issued_at/weather_runs (нейтральный бейдж). Проверка — по правилу архива
// Open-Meteo (выпуск за 1–3 суток до часа) плюс расчётная задержка публикации, а не по журналу публикаций — так и подписываем.

import { useState } from 'react'
import { CloudSun, Filter, Shield, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { Forecast, WeatherRetrieval } from '../../api/types'
import { Badge } from '../../components/ui'
import { rich } from './rich'
import { dateTime, num } from '../../lib/format'
import { tr, useT } from '../../i18n'

/** "gfs_ws100" → «GFS (ветер 100 м)». */
function prettySource(s: string): string {
  const [id, h] = s.split('_ws')
  const name = id === 'best_match' ? 'Open-Meteo' : id.toUpperCase()
  return h ? `${name} (${tr('forecast.prov.wind', { h })})` : name
}

export function Provenance(props: { f: Forecast }) {
  const { t } = useT()
  const BY_DEFINITION = t('forecast.prov.byDefinition')
  const { f } = props
  const ti = f.time_integrity
  const excluded = f.excluded_sources ?? []
  const runsHint = [f.weather_runs, ti?.rule].filter(Boolean).join('\n')

  const run = ti?.latest_weather_run ?? ti?.latest_weather_run_used
  const published = ti?.latest_run_published_by
  const whenLabel = published
    ? t('forecast.prov.publishedBy', { time: dateTime(published) })
    : run
      ? t('forecast.prov.issue', { time: dateTime(run) })
      : ''

  let integrity
  if (ti && ti.ok) {
    integrity = (
      <Badge tone="ok" icon={<ShieldCheck size={14} />} title={`${runsHint}\n${t('forecast.prov.checkTitle', { rule: BY_DEFINITION })}`}>
        <span className="fc-wrap">
          {t('forecast.prov.okMain')}
          {run && rich(t('forecast.prov.okLastRun'), { time: <span className="mono">{dateTime(run)}</span> })}
          {published && rich(t('forecast.prov.okPublished'), { time: <span className="mono">{dateTime(published)}</span> })}
        </span>
      </Badge>
    )
  } else if (ti && !ti.ok) {
    integrity = (
      <Badge tone="error" icon={<ShieldAlert size={14} />} title={runsHint}>
        <span className="fc-wrap">
          {t('forecast.prov.bad', { when: whenLabel || t('forecast.prov.unknownRun'), issued: dateTime(ti.issued_at) })}
        </span>
      </Badge>
    )
  } else {
    integrity = (
      <Badge tone="neutral" icon={<Shield size={14} />} title={f.weather_runs}>
        <span className="fc-wrap">
          {rich(t('forecast.prov.neutral'), { time: <span className="mono">{dateTime(f.issued_at)}</span> })}
        </span>
      </Badge>
    )
  }

  return (
    <div className="fc-prov" aria-label={t('forecast.prov.aria')}>
      <div className="fc-prov-main">
        {integrity}
        <span className="fc-prov-note">{BY_DEFINITION}</span>
      </div>
      {f.weather_retrieval ? (
        <Retrieval r={f.weather_retrieval} />
      ) : (
        <Badge tone="neutral" icon={<CloudSun size={14} />} title={`${f.weather_source}\n${f.weather_runs}`}>
          <span className="fc-wrap">{t('forecast.prov.source')}</span>
        </Badge>
      )}
      {excluded.length > 0 && (
        <Badge tone="info" icon={<Filter size={14} />} title={t('forecast.prov.excludedTitle')}>
          <span className="fc-wrap">
            {t('forecast.prov.excluded', { list: excluded.map(prettySource).join(', ') })}
          </span>
        </Badge>
      )}
    </div>
  )
}

/** Как агент получил погоду: по сети или из локального архива (weather_retrieval). По клику — таблица источников. */
function Retrieval(props: { r: WeatherRetrieval }) {
  const { r } = props
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const n = r.sources.length
  const hash = r.snapshot_hash ? r.snapshot_hash.slice(0, 8) : null
  const label =
    r.origin === 'network'
      ? t('forecast.retrieval.network', { sources: t('forecast.retrieval.sources', { count: n }) })
      : r.origin === 'archive'
        ? t('forecast.retrieval.archive', { sources: t('forecast.retrieval.sources', { count: n }) })
        : t('forecast.retrieval.mixed', { network: r.network_ok, archive: r.archive_fallback })
  return (
    <div className="fc-retr">
      <button
        type="button"
        className={`badge ${r.origin === 'network' ? 'badge-ok' : 'badge-warn'} fc-retr-btn`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={t('forecast.retrieval.showSources')}
      >
        <CloudSun size={14} />
        <span className="fc-wrap">
          {label}
          {hash && rich(t('forecast.retrieval.snapshot'), { hash: <span className="mono">{hash}</span> })}
        </span>
      </button>
      {open && (
        <div className="table-wrap fc-retr-table">
          <table className="data">
            <thead>
              <tr>
                <th>{t('forecast.retrieval.colSource')}</th>
                <th>{t('forecast.retrieval.colOrigin')}</th>
                <th className="r">{t('forecast.retrieval.colHours')}</th>
                <th className="r" title={t('forecast.retrieval.colCheckTitle')}>
                  {t('forecast.retrieval.colCheck')}
                </th>
              </tr>
            </thead>
            <tbody>
              {r.sources.map((s) => (
                <tr key={s.source}>
                  <td className="mono">{s.source}</td>
                  <td>
                    {s.origin === 'network'
                      ? t('forecast.retrieval.originNetwork')
                      : s.reason
                        ? t('forecast.retrieval.originArchiveReason', { reason: s.reason })
                        : t('forecast.retrieval.originArchive')}
                  </td>
                  <td className="r">{s.hours ?? '—'}</td>
                  <td className="r">
                    {s.max_abs_diff_vs_archive == null
                      ? '—'
                      : t('forecast.retrieval.diff', { value: num(s.max_abs_diff_vs_archive, 2) })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.input_updated != null && (
            <p className="small muted">
              {r.input_updated ? t('forecast.retrieval.updated') : t('forecast.retrieval.same')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
