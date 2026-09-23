// Блок «Агент проходит февраль сам»: POST /api/autonomous-run запускает фоновый прогон по дням выпуска,
// GET /api/autonomous-run опрашиваем раз в 2 с, пока status === 'running'. 409 «уже идёт» — не ошибка, просто опрашиваем.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, ChevronRight, Play, RefreshCw } from 'lucide-react'
import { ApiError } from '../../api/client'
import { getAutonomousRun, startAutonomousRun } from '../../api/endpoints'
import type { AutonomousEvent, AutonomousRun as RunState } from '../../api/types'
import { Notice, Spinner } from '../../components/ui'
import { addDays, dateRu, dateShort, hoursFull, ms, pct, weekday } from '../../lib/format'
import { plural } from './febData'

const POLL_MS = 2000
const CARD_LABEL: Record<string, string> = {
  revision: 'пересмотр прогноза',
  wide_interval: 'неуверенные часы',
  input: 'ненадёжный вход',
}

function mmss(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function AutonomousRun(props: { onOpenDate: (date: string) => void }) {
  const { onOpenDate } = props
  const [run, setRun] = useState<RunState | null>(null)
  const [error, setError] = useState<{ text: string; kind: 'get' | 'post' } | null>(null)
  const [starting, setStarting] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const pollRef = useRef<number | null>(null)
  const aliveRef = useRef(true)
  const t0Ref = useRef<number | null>(null)

  const stopPoll = useCallback(() => {
    if (pollRef.current != null) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const fetchOnce = useCallback(async (): Promise<RunState | null> => {
    try {
      const r = await getAutonomousRun()
      if (!aliveRef.current) return null
      setRun(r)
      setError(null)
      if (r.status !== 'running') stopPoll()
      return r
    } catch (e) {
      if (!aliveRef.current) return null
      setError({ text: (e as Error).message, kind: 'get' })
      stopPoll()
      return null
    }
  }, [stopPoll])

  const startPoll = useCallback(() => {
    if (pollRef.current != null) return
    if (t0Ref.current == null) t0Ref.current = Date.now()
    pollRef.current = window.setInterval(fetchOnce, POLL_MS)
  }, [fetchOnce])

  // при монтировании — один GET: running → сразу опрашиваем, done → показываем готовую ленту
  useEffect(() => {
    aliveRef.current = true
    getAutonomousRun()
      .then((r) => {
        if (!aliveRef.current) return
        setRun(r)
        if (r.status === 'running') startPoll()
      })
      .catch((e) => {
        if (aliveRef.current) setError({ text: (e as Error).message, kind: 'get' })
      })
    return () => {
      aliveRef.current = false
      stopPoll()
    }
  }, [startPoll, stopPoll])

  const running = run?.status === 'running'

  // таймер прогона (по часам браузера — с момента запуска/обнаружения прогона)
  useEffect(() => {
    if (!running) return
    if (t0Ref.current == null) t0Ref.current = Date.now()
    const tick = () => setElapsed(Math.floor((Date.now() - (t0Ref.current ?? Date.now())) / 1000))
    const id = window.setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [running])

  const start = async () => {
    if (running || starting) return
    setStarting(true)
    setError(null)
    t0Ref.current = Date.now()
    setElapsed(0)
    try {
      const r = await startAutonomousRun()
      if (!aliveRef.current) return
      setRun({ status: 'running', done: 0, total: r.total ?? 28, events: [], error: null, started_at: r.started_at })
    } catch (e) {
      if (!aliveRef.current) return
      if (!(e instanceof ApiError && e.status === 409)) {
        setError({ text: (e as Error).message, kind: 'post' })
        setStarting(false)
        return
      }
    }
    setStarting(false)
    startPoll()
    fetchOnce()
  }

  const retry = () => {
    if (error?.kind === 'post') {
      start()
    } else {
      setError(null)
      fetchOnce().then((r) => {
        if (r?.status === 'running') startPoll() // прогон ещё идёт — возобновляем опрос
      })
    }
  }

  const events = run?.events ?? []
  const total = run?.total || 28
  const done = run?.done ?? events.length
  const recalcs = events.filter((e) => e.hours_with_fresher_weather > 0).length
  const isDone = run?.status === 'done'
  const busy = running || starting
  const [showAll, setShowAll] = useState(false)
  const FEED_LIMIT = 5
  const ordered = [...events].reverse() // новые сверху
  const shown = showAll ? ordered : ordered.slice(0, FEED_LIMIT)

  // новая строка появилась во время прогона — прокручиваем ленту к началу, чтобы её было видно
  const feedRef = useRef<HTMLOListElement | null>(null)
  useEffect(() => {
    if (running && feedRef.current) feedRef.current.scrollTop = 0
  }, [events.length, running])

  return (
    <section className="card feb-auto" aria-label="Агент проходит февраль сам">
      <div className="feb-auto-head">
        <div className="feb-auto-head-text">
          <h2 className="feb-auto-title">
            <Bot size={20} aria-hidden className="feb-auto-title-ico" /> Агент проходит февраль сам
          </h2>
          <p className="feb-auto-lead">
            День за днём, как в реальной работе: агент сам получает погоду, замечает, что вышел более свежий прогноз погоды, и
            пересчитывает прогноз.
          </p>
        </div>
        <div className="feb-auto-actions">
          <button type="button" className="btn btn-primary" onClick={start} disabled={busy}>
            {busy ? <Spinner /> : isDone ? <RefreshCw size={16} aria-hidden /> : <Play size={16} aria-hidden />}
            {isDone ? 'Прогнать агентом заново' : 'Прогнать февраль агентом'}
          </button>
        </div>
      </div>

      {error && (
        <Notice
          tone="error"
          action={
            <button type="button" className="btn btn-sm" onClick={retry}>
              Повторить
            </button>
          }
        >
          Не удалось {error.kind === 'post' ? 'запустить прогон' : 'получить ход прогона'}: {error.text}
        </Notice>
      )}

      {run?.status === 'error' && (
        <Notice tone="error">Прогон остановился с ошибкой: {run.error || 'причина не указана'}</Notice>
      )}

      {busy && (
        <div className="feb-auto-progress">
          <div className="feb-auto-progress-row">
            <b role="status" aria-live="polite">
              День {Math.min(done + 1, total)} из {total}
            </b>
            <span className="small muted mono">
              <Spinner size={14} /> {mmss(elapsed)}
            </span>
          </div>
          <div
            className="feb-auto-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-label="Прогресс прогона"
          >
            <span style={{ width: `${Math.round((done / total) * 100)}%` }} />
          </div>
        </div>
      )}

      {isDone && (
        <Notice tone="ok">
          Готово: {events.length} {plural(events.length, ['день', 'дня', 'дней'])} · пересчитано {recalcs}{' '}
          {plural(recalcs, ['раз', 'раза', 'раз'])}
        </Notice>
      )}

      {events.length > 0 ? (
        <ol ref={feedRef} className="feb-auto-feed" aria-label="Лента решений агента">
          {shown.map((ev) => (
            <li key={ev.forecast_id || ev.issue_date}>
              <EventRow ev={ev} onOpen={onOpenDate} />
            </li>
          ))}
        </ol>
      ) : null}
      {events.length > FEED_LIMIT ? (
        <button type="button" className="btn btn-ghost btn-sm feb-auto-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Свернуть' : `Показать все ${events.length} ${plural(events.length, ['день', 'дня', 'дней'])}`}
        </button>
      ) : null}
      {events.length > 0 ? null : (
        !busy &&
        !error && (
          <p className="small muted feb-auto-empty">
            Нажмите кнопку — агент пройдёт 28 дней выпуска (31 янв – 27 фев), около 10 секунд на день. Лента решений появится
            здесь.
          </p>
        )
      )}
    </section>
  )
}

function EventRow(props: { ev: AutonomousEvent; onOpen: (date: string) => void }) {
  const { ev } = props
  const fresh = ev.hours_with_fresher_weather > 0
  const rev = ev.revision ?? {}
  const changed = rev.hours_changed_10pp ?? 0
  return (
    <button
      type="button"
      className={`feb-auto-row${fresh ? ' feb-auto-row--fresh' : ''}`}
      onClick={() => props.onOpen(ev.issue_date)}
      title="Открыть подробный прогноз"
    >
      <div className="feb-auto-row-top">
        <span className="feb-auto-date">
          <b className="mono">{dateRu(ev.issue_date)}</b> <span className="muted">{weekday(ev.issue_date)}</span>
          <span className="muted"> → прогноз на {dateShort(addDays(ev.issue_date, 1))}</span>
        </span>
        <span className="feb-auto-ms small mono muted">{ms(ev.ms)}</span>
      </div>
      {fresh && (
        <div className="feb-auto-fresh">Обновление погоды: {ev.hours_with_fresher_weather} ч → пересчёт</div>
      )}
      <div className="feb-auto-decision">{ev.decision}</div>
      <div className="feb-auto-chips">
        {changed > 0 && <span className="feb-auto-chip feb-auto-chip--accent">пересмотр: {changed} ч из 24 изменились ≥10 п.п.</span>}
        {rev.mean_abs_change != null && <span className="feb-auto-chip">среднее изменение {pct(rev.mean_abs_change, 1)}</span>}
        <span className="feb-auto-chip">выработка на след. день {hoursFull(ev.energy_d1)}</span>
        {ev.weather_origin === 'network' && <span className="feb-auto-chip">погода получена по сети</span>}
        {ev.weather_origin === 'archive' && (
          <span className="feb-auto-chip feb-auto-chip--warn">погода из локального архива</span>
        )}
        {ev.weather_origin === 'mixed' && <span className="feb-auto-chip feb-auto-chip--warn">частично из архива</span>}
        {!ev.validation_ok && <span className="feb-auto-chip feb-auto-chip--error">проверка не пройдена</span>}
        {(ev.cards ?? []).map((c) => (
          <span key={c} className="feb-auto-chip feb-auto-chip--card">
            {CARD_LABEL[c] ?? c}
          </span>
        ))}
        <ChevronRight size={16} aria-hidden className="feb-auto-go" />
      </div>
    </button>
  )
}
