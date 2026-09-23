// Вкладка «Прогноз» — главный экран: выбор выпуска, запуск агента, почасовой прогноз на D+1/D+2, честность погоды,
// анализ, журнал шагов. Данные — только из ответа бэкенда (docs/api-contract.md); работает и с контрактом v1, и с v2.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Wind } from 'lucide-react'
import { ApiError } from '../../api/client'
import { getForecast, getForecastProgress, postForecast } from '../../api/endpoints'
import type { AgentStep } from '../../api/types'
import type { Forecast } from '../../api/types'
import type { ForecastTabProps } from '../../app/shared'
import { Badge, Empty, Notice, Skeleton, Spinner } from '../../components/ui'
import { tr, useT } from '../../i18n'
import { dateRu, dateTime, ms } from '../../lib/format'
import { AgentLog } from './AgentLog'
import { ControlPanel } from './ControlPanel'
import { ForecastChart } from './ForecastChart'
import { HourlyTable } from './HourlyTable'
import { Analysis, Explanation } from './Insights'
import { KpiRow } from './KpiRow'
import { Provenance } from './Provenance'
import { useElapsed, useMediaQuery } from './hooks'
import { ddmm, objectLabel, targetDays, type ObjectId } from './model'
import { StationMap } from './StationMap'
import { HowItWorks } from './HowItWorks'
import { Verdict } from './Verdict'
import './forecast.css'

const REVEAL_STEP_MS = 120

function without<T>(rec: Record<string, T>, key: string): Record<string, T> {
  const next = { ...rec }
  delete next[key]
  return next
}

function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return tr('forecast.errors.noConnection', { message: e.message })
  return tr('forecast.errors.unknown')
}

export default function ForecastTab(props: ForecastTabProps) {
  const { t } = useT()
  const { meta, theme, issueDate, onIssueDateChange } = props
  const first = meta.issue_range.first
  const last = meta.issue_range.last

  // вкладка не размонтируется — кэшируем прогнозы по дате выпуска в состоянии
  const [cache, setCache] = useState<Record<string, Forecast>>({})
  const [looked, setLooked] = useState<Record<string, boolean>>({}) // GET по дате завершён
  const requested = useRef(new Set<string>())
  const [running, setRunning] = useState<{ date: string; startedAt: number } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [requestMs, setRequestMs] = useState<Record<string, number>>({})
  const [object, setObject] = useState<ObjectId>('station')
  const [reveal, setReveal] = useState<{ date: string; shown: number } | null>(null)

  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const elapsed = useElapsed(running?.startedAt ?? null)

  // сохранённый прогноз на выбранную дату (v2: GET /api/forecast/{date}; в v1 эндпоинта нет → null)
  useEffect(() => {
    const d = issueDate
    if (requested.current.has(d)) return
    requested.current.add(d)
    getForecast(d)
      .then((f) => {
        if (f) setCache((c) => (c[d] ? c : { ...c, [d]: f }))
      })
      .catch(() => {
        /* сохранённого прогноза нет или сервер недоступен — покажем кнопку «Сделать прогноз» */
      })
      .finally(() => setLooked((l) => ({ ...l, [d]: true })))
  }, [issueDate])

  // короткое проигрывание появления реальных шагов после ответа
  useEffect(() => {
    if (!reveal) return
    const total = cache[reveal.date]?.steps.length ?? 0
    const id = window.setTimeout(
      () => setReveal((r) => (r == null || r.shown + 1 >= total ? null : { ...r, shown: r.shown + 1 })),
      REVEAL_STEP_MS,
    )
    return () => window.clearTimeout(id)
  }, [reveal, cache])

  // живой прогресс: пока идёт прогноз, раз в 500 мс забираем завершённые шаги агента
  const [liveSteps, setLiveSteps] = useState<AgentStep[]>([])
  const runningDate = running?.date ?? null
  useEffect(() => {
    if (!runningDate) return
    setLiveSteps([])
    let alive = true
    const tick = () =>
      getForecastProgress(runningDate)
        .then((p) => alive && setLiveSteps(p.steps))
        .catch(() => {
          /* прогресс не критичен — итог придёт в ответе */
        })
    const id = window.setInterval(tick, 500)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [runningDate])

  const run = useCallback(async () => {
    if (running) return
    const d = issueDate
    const t0 = Date.now()
    setRunning({ date: d, startedAt: t0 })
    setErrors((e) => without(e, d))
    try {
      const f = await postForecast(d)
      setCache((c) => ({ ...c, [d]: f }))
      setRequestMs((m) => ({ ...m, [d]: Date.now() - t0 }))
      // шаги уже показаны по ходу работы — повторное проигрывание не нужно
      setReveal(null)
    } catch (e) {
      setErrors((x) => ({ ...x, [d]: errorText(e) }))
    } finally {
      setRunning(null)
    }
  }, [running, issueDate, reducedMotion])

  const f = cache[issueDate] ?? null
  const runningHere = running?.date === issueDate
  const busyOther = running && !runningHere ? running.date : null
  const error = errors[issueDate] ?? null
  const lookingUp = !f && !looked[issueDate]
  const shown = runningHere ? null : f // во время пересчёта старый прогноз не показываем вперемешку с новым
  const invalid = shown?.time_integrity?.ok === false
  const replaying = reveal != null && f != null && reveal.date === f.issue_date
  const visibleSteps = f ? (replaying && reveal ? f.steps.slice(0, reveal.shown) : f.steps) : []
  const [d1, d2] = targetDays(issueDate)

  return (
    <div className="fc-layout">
      <div className="fc-area-intro">
        <HowItWorks />
      </div>

      <div className="fc-area-ctrl">
        <ControlPanel
          issueDate={issueDate}
          first={first}
          last={last}
          onDateChange={onIssueDateChange}
          object={object}
          onObjectChange={setObject}
          hasForecast={f != null}
          running={runningHere}
          busyOther={busyOther}
          elapsed={elapsed}
          modelReady={meta.model_ready}
          onRun={run}
        />
      </div>

      {shown && (
        <div className="fc-area-verdict">
          <Verdict f={shown} object={object} issueDate={issueDate} />
        </div>
      )}

      {shown && (
        <div className="fc-area-prov">
          <Provenance f={shown} />
        </div>
      )}

      <div className="fc-area-kpi">
        <KpiRow f={shown} object={object} issueDate={issueDate} loading={runningHere || lookingUp} />
      </div>

      <section className="card fc-area-chart fc-chart-card" aria-label={t('forecast.chart.aria')}>
        <div className="fc-chart-head">
          <div>
            <div className="eyebrow">{t('forecast.chart.eyebrow')}</div>
            <h2 className="card-title">
              {t('forecast.chart.title', { object: objectLabel(object) })}
              <span className="muted fc-chart-days">
                {' '}
                · {t('forecast.chart.days', { d1: ddmm(d1), d2: ddmm(d2) })}
              </span>
            </h2>
          </div>
          {shown && (
            <div className="fc-chart-meta">
              {object !== 'station' && <span className="fc-chart-hint">{t('forecast.chart.bandOnlyStation')}</span>}
              {requestMs[issueDate] != null ? (
                <Badge tone="ok">{t('forecast.chart.ready', { time: ms(requestMs[issueDate]) })}</Badge>
              ) : shown.computed_at ? (
                <Badge tone="neutral">{t('forecast.chart.saved', { time: dateTime(shown.computed_at) })}</Badge>
              ) : null}
            </div>
          )}
        </div>

        {error && (
          <Notice
            tone="error"
            action={
              <button type="button" className="btn btn-sm" onClick={run} disabled={running != null}>
                {t('forecast.chart.retry')}
              </button>
            }
          >
            {t('forecast.chart.failed', { date: dateRu(issueDate), error })}
            {f && <span className="fc-notice-sub">{t('forecast.chart.previousBelow')}</span>}
          </Notice>
        )}

        {runningHere ? (
          <div className="fc-loading" role="status">
            <span className="fc-loading-spin" aria-hidden>
              <Spinner size={20} label={t('forecast.chart.agentWorking', { sec: elapsed })} />
            </span>
            <span className="fc-sr-only">{t('forecast.chart.agentWorkingSr')}</span>
            <p>{t('forecast.chart.loadingText', { date: ddmm(issueDate) })}</p>
            <p className="muted small">{t('forecast.chart.firstRunNote')}</p>
          </div>
        ) : shown ? (
          <ForecastChart f={shown} object={object} theme={theme} invalid={invalid} />
        ) : lookingUp ? (
          <Skeleton height={360} />
        ) : !error ? (
          <Empty icon={<Wind size={28} aria-hidden />} title={t('forecast.chart.emptyTitle', { date: dateRu(issueDate) })}>
            <p className="fc-empty-text">
              {t('forecast.chart.emptyText', { date: ddmm(issueDate), d1: ddmm(d1), d2: ddmm(d2) })}
            </p>
            <button type="button" className="btn btn-primary" onClick={run} disabled={running != null}>
              <Play size={16} /> {t('forecast.controls.run')}
            </button>
          </Empty>
        ) : null}
      </section>

      <div className="fc-area-map">
        <StationMap meta={meta} f={shown} object={object} onObjectChange={setObject} theme={theme} />
      </div>

      <div className="fc-area-log">
        <AgentLog
          f={f}
          visibleSteps={visibleSteps}
          liveSteps={liveSteps}
          replaying={replaying}
          running={runningHere}
          elapsed={elapsed}
          metaMode={meta.mode}
          llmModel={meta.llm_model}
          issueDate={issueDate}
          requestMs={requestMs[issueDate] ?? null}
        />
      </div>

      {shown && (
        <div className="fc-area-notes fc-notes">
          <Explanation f={shown} llmModel={meta.llm_model} />
          <Analysis f={shown} />
        </div>
      )}

      {shown && (
        <div className="fc-area-table">
          <HourlyTable f={shown} object={object} />
        </div>
      )}
    </div>
  )
}
