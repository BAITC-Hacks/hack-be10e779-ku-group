// Вкладка «Прогноз на период» (сейчас — тестовый период ТЗ, февраль 2026) — ретроспективный прогон: 28 выпусков (D 23:59) → прогноз на D+1 и D+2, весь февраль.
// Данные: GET /api/backtest (v2, готовые CSV; в v1 эндпоинта нет → null) и POST /api/backtest (полный прогон, перезапись CSV).
// Факта за февраль нет — здесь только прогнозы. Вкладка не размонтируется (App прячет её через hidden), состояние живёт здесь.

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CalendarDays, Play, RefreshCw } from 'lucide-react'
import type { FebruaryTabProps } from '../../app/shared'
import { getBacktest, postBacktest } from '../../api/endpoints'
import { Badge, Card, Empty, Notice, Skeleton, Spinner } from '../../components/ui'
import { addDays, dateRu, dateShort, dateTime, int, num, pct } from '../../lib/format'
import { useT } from '../../i18n'
import { daysBetween, ddmm, flagHead, mean, normalize, type FebData } from './febData'
import { FebCalendar } from './FebCalendar'
import { FebFinalChart } from './FebChart'
import { FebDownloads } from './FebDownloads'
import { AutonomousRun } from './AutonomousRun'
import './february.css'

type Load =
  | { state: 'loading' }
  | { state: 'empty' }
  | { state: 'error'; message: string }
  | { state: 'ready'; data: FebData; source: 'saved' | 'run' }

type Run =
  | { state: 'idle' }
  | { state: 'confirm' }
  | { state: 'running'; startedAt: number }
  | { state: 'done'; seconds: number; runs: number; file: string | null }
  | { state: 'failed'; message: string }

/** Строка словаря с {плейсхолдерами} → узлы React (подставляет элементы вместо {name}). */
function rich(s: string, nodes: Record<string, ReactNode>): ReactNode {
  return s.split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part)
    return m && m[1] in nodes ? <Fragment key={i}>{nodes[m[1]]}</Fragment> : part
  })
}

/** GET /api/backtest → состояние экрана. null (v1: эндпоинта нет; v2: 404 «не выполнялся») — пустое состояние. */
async function loadSaved(): Promise<Load> {
  try {
    const b = await getBacktest()
    return b ? { state: 'ready', data: normalize(b), source: 'saved' } : { state: 'empty' }
  } catch (e) {
    return { state: 'error', message: (e as Error).message }
  }
}

export default function FebruaryTab({ meta, theme, onOpenDate }: FebruaryTabProps) {
  const { t } = useT()
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [run, setRun] = useState<Run>({ state: 'idle' })
  const [elapsed, setElapsed] = useState(0)

  const expectedRuns = daysBetween(meta.issue_range.first, meta.issue_range.last)
  const firstTarget = addDays(meta.issue_range.first, 1)
  const [calYear, calMonth] = firstTarget.split('-').map(Number)

  useEffect(() => {
    let alive = true
    loadSaved().then((l) => {
      if (alive) setLoad(l)
    })
    return () => {
      alive = false
    }
  }, [])

  const reload = () => {
    setLoad({ state: 'loading' })
    loadSaved().then(setLoad)
  }

  const startedAt = run.state === 'running' ? run.startedAt : null
  useEffect(() => {
    if (startedAt == null) return
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [startedAt])

  const running = run.state === 'running'

  const startRun = async () => {
    if (running) return
    const t0 = Date.now()
    setElapsed(0)
    setRun({ state: 'running', startedAt: t0 })
    try {
      const b = await postBacktest()
      const data = normalize(b)
      setLoad({ state: 'ready', data, source: 'run' })
      setRun({ state: 'done', seconds: Math.round((Date.now() - t0) / 1000), runs: data.runs, file: data.file })
    } catch (e) {
      setRun({ state: 'failed', message: (e as Error).message })
    }
  }

  const data = load.state === 'ready' ? load.data : null
  const items = useMemo(() => data?.items ?? [], [data])
  const stats = useMemo(() => {
    const avg = mean(items.map((r) => r.energyD1))
    const warnDays = items.filter((r) => r.flags.length > 0).length
    // самый частый вид предупреждения (по началу текста флага) — для подписи карточки
    const counts = new Map<string, number>()
    for (const r of items) for (const h of new Set(r.flags.map(flagHead))) counts.set(h, (counts.get(h) ?? 0) + 1)
    const top = [...counts.entries()].sort((a, z) => z[1] - a[1])[0] ?? null
    return { avg, warnDays, top }
  }, [items])

  const runLabel = t('february.runs', { count: expectedRuns, n: int(expectedRuns) })

  // --- панель запуска: подтверждение → прогресс → итог / ошибка ---
  const runPanel: ReactNode = (() => {
    switch (run.state) {
      case 'confirm':
        return (
          <div className="feb-confirm" role="group" aria-label={t('february.confirm.aria')}>
            <div>
              <b>{data ? t('february.confirm.again') : t('february.confirm.first')}</b>
              <div className="small muted">
                {rich(
                  t('february.confirm.text', {
                    runs: runLabel,
                    range: `${ddmm(meta.issue_range.first)}–${dateRu(meta.issue_range.last)}`,
                  }),
                  { file: <code>outputs/forecast_feb2026.csv</code> },
                )}
              </div>
            </div>
            <div className="feb-confirm-actions">
              <button type="button" className="btn btn-primary" onClick={startRun} autoFocus>
                <Play size={16} aria-hidden /> {t('february.confirm.start')}
              </button>
              <button type="button" className="btn" onClick={() => setRun({ state: 'idle' })}>
                {t('february.confirm.cancel')}
              </button>
            </div>
          </div>
        )
      case 'running':
        return (
          <div className="feb-running" role="status" aria-live="polite">
            <Spinner size={18} />
            <div>
              <b>{rich(t('february.running.title', { runs: runLabel }), { sec: <span className="mono">{int(elapsed)}</span> })}</b>
              <div className="small muted">{t('february.running.hint')}</div>
            </div>
          </div>
        )
      case 'failed':
        return (
          <Notice
            tone="error"
            action={
              <button type="button" className="btn btn-sm" onClick={startRun}>
                {t('february.retry')}
              </button>
            }
          >
            {t('february.failed', { error: run.message })}
          </Notice>
        )
      case 'done':
        return (
          <Notice tone="ok">
            {t('february.done', { sec: int(run.seconds), runs: t('february.runs', { count: run.runs, n: int(run.runs) }) })}{' '}
            {run.file ? rich(t('february.fileOverwritten'), { file: <code>{run.file}</code> }) : t('february.fileNotWritten')}
          </Notice>
        )
      default:
        return null
    }
  })()

  const askRun = () => setRun({ state: 'confirm' })

  const headAction =
    load.state === 'ready' || load.state === 'error' ? (
      <button type="button" className="btn" onClick={askRun} disabled={running || run.state === 'confirm'}>
        {running ? <Spinner /> : <RefreshCw size={16} aria-hidden />}
        {data ? t('february.rerun') : t('february.runAll')}
      </button>
    ) : null

  const ranked = [...items].sort((a, b) => b.energyD1 - a.energyD1)

  return (
    <div className="feb">
      <header className="feb-head">
        <div className="feb-head-text">
          <h1 className="feb-title">
            {t('february.periodTitle', {
              from: dateRu(addDays(meta.issue_range.first, 1)),
              to: dateRu(addDays(meta.issue_range.last, 1)),
            })}
          </h1>
          <p className="feb-lead">{t('february.periodLead')}</p>
        </div>
        {headAction && <div className="feb-head-actions">{headAction}</div>}
      </header>

      <Notice tone="info">{t('february.noActual')}</Notice>

      {!(data && items.length > 0) && <AutonomousRun onOpenDate={onOpenDate} />}

      {load.state !== 'empty' && runPanel}

      {load.state === 'loading' && (
        <div className="feb-stack" aria-busy="true" aria-label={t('february.loadingAria')}>
          <div className="feb-kpis">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={92} />
            ))}
          </div>
          <div className="feb-main">
            <Skeleton height={340} />
            <Skeleton height={340} />
          </div>
        </div>
      )}

      {load.state === 'error' && (
        <Notice
          tone="error"
          action={
            <button type="button" className="btn btn-sm" onClick={reload}>
              {t('february.retry')}
            </button>
          }
        >
          {t('february.loadError', { error: load.message })}
        </Notice>
      )}

      {load.state === 'empty' && (
        <Card>
          <Empty icon={<CalendarDays size={28} className="feb-empty-ico" aria-hidden />} title={t('february.empty.title')}>
            <p className="feb-empty-text small">
              {rich(t('february.empty.text', { runs: runLabel }), { file: <code>outputs/forecast_feb2026.csv</code> })}
            </p>
            {run.state === 'idle' ? (
              <button type="button" className="btn btn-primary" onClick={askRun}>
                <Play size={16} aria-hidden /> {t('february.runAll')}
              </button>
            ) : (
              <div className="feb-empty-run">{runPanel}</div>
            )}
          </Empty>
        </Card>
      )}

      {data && items.length === 0 && (
        <Card>
          <Empty title={t('february.noRuns.title')}>{t('february.noRuns.text')}</Empty>
        </Card>
      )}

      {data && items.length > 0 && (
        <div className="feb-stack">
          <section className="card feb-verdict" aria-label={t('february.verdict.aria')}>
            <div className="eyebrow">{t('february.verdict.eyebrow')}</div>
            <p className="feb-verdict-text">
              {rich(t('february.verdict.text'), {
                share: <b className="mono">{pct(stats.avg != null ? stats.avg / 24 : null)}</b>,
                windy: <b>{ranked.slice(0, 3).map((r) => dateShort(r.d1)).join(', ')}</b>,
                calm: <b>{ranked.slice(-3).reverse().map((r) => dateShort(r.d1)).join(', ')}</b>,
              })}
            </p>
            <p className="small muted">{t('february.verdict.hint')}</p>
          </section>
          <div className="feb-kpis">
            <Kpi
              label={t('february.kpi.runs')}
              value={int(data.runs)}
              sub={`${ddmm(items[0].issue)}–${dateRu(items[items.length - 1].issue)}, 23:59`}
            />
            <Kpi
              label={t('february.kpi.avg')}
              value={
                <>
                  {num(stats.avg)}
                  <span className="feb-kpi-unit"> {t('february.unitH')}</span>
                </>
              }
              sub={t('february.kpi.avgSub', { share: pct(stats.avg != null ? stats.avg / 24 : null) })}
            />
            <Kpi
              label={t('february.kpi.warnDays')}
              value={
                <>
                  {int(stats.warnDays)}
                  <span className="feb-kpi-unit"> {t('february.kpi.of', { n: int(items.length) })}</span>
                </>
              }
              sub={
                stats.warnDays === 0 && load.state === 'ready' && load.source === 'saved'
                  ? t('february.kpi.savedNoFlags')
                  : stats.top
                    ? t('february.kpi.top', { flag: stats.top[0], n: int(stats.top[1]) })
                    : t('february.kpi.noRemarks')
              }
            />
            <Kpi
              label={t('february.kpi.file')}
              value={<span className="feb-kpi-file">{data.file ?? t('february.kpi.notWritten')}</span>}
              sub={
                data.generatedAt
                  ? t('february.kpi.written', { time: dateTime(data.generatedAt) })
                  : data.finalFile
                    ? t('february.kpi.finalSeries', { file: data.finalFile })
                    : load.state === 'ready' && load.source === 'run'
                      ? t('february.kpi.justRewritten')
                      : ''
              }
            />
          </div>

          <AutonomousRun onOpenDate={onOpenDate} />

          <div className="feb-main">
            <Card eyebrow={t('february.cal.eyebrow')} title={t('february.cal.title')} className="feb-card-cal">
              <FebCalendar items={items} year={calYear} month={calMonth} onOpen={onOpenDate} />
            </Card>
            {data.finalHours.length > 0 && (
              <Card
                eyebrow={t('february.final.eyebrow')}
                title={t('february.final.title', { n: int(data.finalHours.length) })}
                actions={<Badge tone="neutral">{t('february.chart.badge')}</Badge>}
                className="feb-card-chart"
              >
                <FebFinalChart hours={data.finalHours} theme={theme} />
                <div className="small muted">{t('february.final.hint')}</div>
              </Card>
            )}
          </div>

          <Card eyebrow={t('february.dl.eyebrow')} title={t('february.dl.title')}>
            <FebDownloads runs={data.runs} />
          </Card>

        </div>
      )}

      {!data && load.state !== 'loading' && (
        <Card eyebrow={t('february.dl.eyebrow')} title={t('february.dl.title')}>
          <FebDownloads runs={expectedRuns} />
        </Card>
      )}
    </div>
  )
}

function Kpi(props: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="feb-kpi">
      <div className="eyebrow">{props.label}</div>
      <div className="feb-kpi-val mono">{props.value}</div>
      {props.sub && <div className="feb-kpi-sub small muted">{props.sub}</div>}
    </div>
  )
}
