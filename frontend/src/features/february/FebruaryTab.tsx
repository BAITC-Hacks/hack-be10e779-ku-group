// Вкладка «Прогноз на период» (сейчас — тестовый период ТЗ, февраль 2026) — ретроспективный прогон: 28 выпусков (D 23:59) → прогноз на D+1 и D+2, весь февраль.
// Данные: GET /api/backtest (v2, готовые CSV; в v1 эндпоинта нет → null) и POST /api/backtest (полный прогон, перезапись CSV).
// Факта за февраль нет — здесь только прогнозы. Вкладка не размонтируется (App прячет её через hidden), состояние живёт здесь.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CalendarDays, Play, RefreshCw } from 'lucide-react'
import type { FebruaryTabProps } from '../../app/shared'
import { getBacktest, postBacktest } from '../../api/endpoints'
import { Badge, Card, Empty, Notice, Skeleton, Spinner } from '../../components/ui'
import { addDays, dateRu, dateShort, dateTime, num, pct } from '../../lib/format'
import { daysBetween, ddmm, flagHead, int, mean, normalize, plural, type FebData } from './febData'
import { FebCalendar } from './FebCalendar'
import { FebBarsChart, FebFinalChart } from './FebChart'
import { FebTable } from './FebTable'
import { FebDownloads } from './FebDownloads'
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

  const runLabel = `${int(expectedRuns)} ${plural(expectedRuns, ['выпуск', 'выпуска', 'выпусков'])}`

  // --- панель запуска: подтверждение → прогресс → итог / ошибка ---
  const runPanel: ReactNode = (() => {
    switch (run.state) {
      case 'confirm':
        return (
          <div className="feb-confirm" role="group" aria-label="Подтверждение прогона">
            <div>
              <b>{data ? 'Прогнать весь февраль заново?' : 'Прогнать весь февраль?'}</b>
              <div className="small muted">
                Перезапишет <code>outputs/forecast_feb2026.csv</code>, займёт около минуты. {runLabel} подряд, выпуски{' '}
                {ddmm(meta.issue_range.first)}–{dateRu(meta.issue_range.last)}.
              </div>
            </div>
            <div className="feb-confirm-actions">
              <button type="button" className="btn btn-primary" onClick={startRun} autoFocus>
                <Play size={16} aria-hidden /> Запустить
              </button>
              <button type="button" className="btn" onClick={() => setRun({ state: 'idle' })}>
                Отмена
              </button>
            </div>
          </div>
        )
      case 'running':
        return (
          <div className="feb-running" role="status" aria-live="polite">
            <Spinner size={18} />
            <div>
              <b>
                Идёт прогон: {runLabel} · идёт <span className="mono">{int(elapsed)}</span> с
              </b>
              <div className="small muted">
                Обычно около минуты. Можно переключиться на другие вкладки — результат появится здесь.
              </div>
            </div>
          </div>
        )
      case 'failed':
        return (
          <Notice
            tone="error"
            action={
              <button type="button" className="btn btn-sm" onClick={startRun}>
                Повторить
              </button>
            }
          >
            Прогон не выполнен: {run.message}
          </Notice>
        )
      case 'done':
        return (
          <Notice tone="ok">
            Прогон завершён за {int(run.seconds)} с: {int(run.runs)} {plural(run.runs, ['выпуск', 'выпуска', 'выпусков'])}.{' '}
            {run.file ? (
              <>
                Файл перезаписан: <code>{run.file}</code>
              </>
            ) : (
              'Файл не записан.'
            )}
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
        {data ? 'Прогнать заново' : 'Прогнать весь февраль'}
      </button>
    ) : null

  const ranked = [...items].sort((a, b) => b.energyD1 - a.energyD1)

  return (
    <div className="feb">
      <header className="feb-head">
        <div className="feb-head-text">
          <h1 className="feb-title">Прогноз на период · {dateRu(addDays(meta.issue_range.first, 1))}–{dateRu(addDays(meta.issue_range.last, 1))}</h1>
          <p className="feb-lead">Сейчас доступен тестовый период из ТЗ — февраль 2026: история данных заканчивается 31.01.2026. В рабочем режиме период может быть любым.</p>
          <p className="feb-lead">
            {runLabel}: каждый делается вечером накануне по прогнозу погоды, известному на тот момент, — как будто будущее ещё неизвестно
          </p>
        </div>
        {headAction && <div className="feb-head-actions">{headAction}</div>}
      </header>

      <Notice tone="info">
        Факта выработки за февраль 2026 нет — здесь только прогнозы. Качество модели проверено на истории (окт 2025 – янв 2026) — вкладка «Качество
        модели»
      </Notice>

      {load.state !== 'empty' && runPanel}

      {load.state === 'loading' && (
        <div className="feb-stack" aria-busy="true" aria-label="Загрузка результатов прогона">
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
              Повторить
            </button>
          }
        >
          Не удалось загрузить результаты прогона: {load.message}
        </Notice>
      )}

      {load.state === 'empty' && (
        <Card>
          <Empty icon={<CalendarDays size={28} className="feb-empty-ico" aria-hidden />} title="Результаты прогона ещё не загружены">
            <p className="feb-empty-text small">
              Сервер пока не отдаёт сохранённый прогон. Прогон посчитает {runLabel} заново и запишет{' '}
              <code>outputs/forecast_feb2026.csv</code>.
            </p>
            {run.state === 'idle' ? (
              <button type="button" className="btn btn-primary" onClick={askRun}>
                <Play size={16} aria-hidden /> Прогнать весь февраль
              </button>
            ) : (
              <div className="feb-empty-run">{runPanel}</div>
            )}
          </Empty>
        </Card>
      )}

      {data && items.length === 0 && (
        <Card>
          <Empty title="Сервер вернул прогон без выпусков">Попробуйте прогнать февраль заново.</Empty>
        </Card>
      )}

      {data && items.length > 0 && (
        <div className="feb-stack">
          <section className="card feb-verdict" aria-label="Главное за февраль">
            <div className="eyebrow">Главное</div>
            <p className="feb-verdict-text">
              В феврале станция в среднем будет работать на <b className="mono">{pct(stats.avg != null ? stats.avg / 24 : null)}</b>{' '}
              от максимальной мощности. Самые ветреные дни — <b>{ranked.slice(0, 3).map((r) => dateShort(r.d1)).join(', ')}</b>;
              самые тихие — <b>{ranked.slice(-3).reverse().map((r) => dateShort(r.d1)).join(', ')}</b>.
            </p>
            <p className="small muted">Нажмите на день в календаре или столбец на графике — откроется подробный прогноз.</p>
          </section>
          <div className="feb-kpis">
            <Kpi
              label="Прогнозов"
              value={int(data.runs)}
              sub={`${ddmm(items[0].issue)}–${dateRu(items[items.length - 1].issue)}, 23:59`}
            />
            <Kpi
              label="В среднем за сутки"
              value={
                <>
                  {num(stats.avg)}
                  <span className="feb-kpi-unit"> ч</span>
                </>
              }
              sub={`ч работы на полную мощность ≈ ${pct(stats.avg != null ? stats.avg / 24 : null)} от макс.`}
            />
            <Kpi
              label="Дней с предупреждениями"
              value={
                <>
                  {int(stats.warnDays)}
                  <span className="feb-kpi-unit"> из {int(items.length)}</span>
                </>
              }
              sub={
                stats.warnDays === 0 && load.state === 'ready' && load.source === 'saved'
                  ? 'в сохранённых результатах флагов нет'
                  : stats.top
                    ? `чаще всего: ${stats.top[0]} (${int(stats.top[1])} дн.)`
                    : 'замечаний анализа нет'
              }
            />
            <Kpi
              label="Файл"
              value={<span className="feb-kpi-file">{data.file ?? 'не записан'}</span>}
              sub={
                data.generatedAt
                  ? `записан ${dateTime(data.generatedAt)}`
                  : data.finalFile
                    ? `итоговый ряд: ${data.finalFile}`
                    : load.state === 'ready' && load.source === 'run'
                      ? 'только что перезаписан прогоном'
                      : ''
              }
            />
          </div>

          <div className="feb-main">
            <Card eyebrow="Календарь" title="Прогноз на каждые сутки" className="feb-card-cal">
              <FebCalendar items={items} year={calYear} month={calMonth} onOpen={onOpenDate} />
            </Card>
            <Card
              eyebrow="Обзор месяца"
              title="Выработка по дням, ч работы на полную мощность"
              actions={<Badge tone="neutral">прогноз, не факт</Badge>}
              className="feb-card-chart"
            >
              <FebBarsChart items={items} theme={theme} onOpen={onOpenDate} />
              <div className="feb-legend small muted">
                <span>
                  <i className="feb-sw feb-sw--d1" /> прогноз, сделанный накануне
                </span>
                <span>
                  <i className="feb-sw feb-sw--warn" /> есть предупреждения агента
                </span>
                {items.some((r) => r.energyD2 != null) && (
                  <span>
                    <i className="feb-sw feb-sw--d2" /> прогноз на тот же день, сделанный за 2 дня
                  </span>
                )}
                <span>клик по столбцу — открыть прогноз</span>
              </div>
              {data.finalHours.length > 0 && (
                <div className="feb-final">
                  <div className="eyebrow">
                    Весь февраль по часам · {int(data.finalHours.length)} ч · прогноз и вероятный диапазон, % от макс.
                  </div>
                  <FebFinalChart hours={data.finalHours} theme={theme} />
                  <div className="small muted">Каждый час — из самого свежего прогноза (сделанного накануне).</div>
                </div>
              )}
            </Card>
          </div>

          <Card eyebrow="Выгрузка" title="CSV прогноза февраля">
            <FebDownloads runs={data.runs} />
          </Card>

          <Card eyebrow="Прогнозы" title={`Все прогнозы · ${int(items.length)}`}>
            <FebTable items={items} onOpen={onOpenDate} />
          </Card>
        </div>
      )}

      {!data && load.state !== 'loading' && (
        <Card eyebrow="Выгрузка" title="CSV прогноза февраля">
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
