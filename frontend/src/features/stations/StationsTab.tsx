// Вкладка «Станции»: станции и турбины, загрузка истории по месяцам (CSV), кривая мощности станции и прогноз на 48 ч.
// Для станции из ТЗ — только просмотр (полная модель во вкладке «Прогноз»); для новых — упрощённая модель на бэкенде.

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Plus, Wind } from 'lucide-react'
import { api } from '../../api/client'
import type { Theme } from '../../app/shared'
import { EChart, type ChartOption } from '../../components/EChart'
import { Badge, Card, Empty, Notice, Spinner } from '../../components/ui'
import { dateRu, dateTime, esc, hoursFull, int, num, pct } from '../../lib/format'
import { cssVar } from '../../lib/theme'
import UploadBox from './UploadBox'
import './stations.css'

type Turbine = {
  id: number
  name: string
  latitude: number
  longitude: number
  history_rows: number
  history_start: string | null
  history_end: string | null
  history_file: string | null
}
type Station = {
  id: number
  name: string
  latitude: number
  longitude: number
  region: string
  is_case: boolean
  model_status: string
  created_at: string
  turbines: Turbine[]
}
type Curve = {
  station_id: number
  hours: number
  period: [string, string]
  points: { wind: number; p10: number; p50: number; p90: number; n: number }[]
}
type StationForecast = {
  station_id: number
  issued_at: string
  weather_source: string
  model: string
  note: string
  hours: { time: string; wind_100m: number; p10: number; p50: number; p90: number }[]
  summary: { energy_d1: number; energy_d2: number; peak_hour: string }
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const period = (a?: string | null, b?: string | null) => (a && b ? `${dateRu(a)} — ${dateRu(b)}` : '—')
const coords = (lat: number, lon: number) => `${num(lat, 4)}, ${num(lon, 4)}`

function readColors(_theme: Theme) {
  return {
    primary: cssVar('--primary'),
    band: cssVar('--primary-band'),
    text3: cssVar('--text-3'),
    border: cssVar('--border'),
    surface: cssVar('--surface-solid'),
    text: cssVar('--text'),
  }
}

const isReady = (s: Station) => s.model_status.toLowerCase().startsWith('модель пересчитана')
const minStr = (xs: (string | null)[]) => xs.filter((x): x is string => !!x).sort()[0] ?? null
const maxStr = (xs: (string | null)[]) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null
const stationPeriod = (s: Station) =>
  period(minStr(s.turbines.map((t) => t.history_start)), maxStr(s.turbines.map((t) => t.history_end)))

function StatusBadge({ station, ready }: { station: Station; ready: boolean }) {
  if (station.is_case) return <Badge tone="info">из ТЗ</Badge>
  return ready ? <Badge tone="ok">модель готова</Badge> : <Badge tone="warn">нужна история</Badge>
}

export default function StationsTab({ theme }: { theme: Theme }) {
  const [stations, setStations] = useState<Station[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selId, setSelId] = useState<number | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [withCurve, setWithCurve] = useState<Set<number>>(() => new Set())

  const load = useCallback(() => {
    api<Station[]>('/api/stations')
      .then((s) => {
        setStations(s)
        setError(null)
      })
      .catch((e) => setError(errText(e)))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onCurve = useCallback((id: number, has: boolean) => {
    setWithCurve((prev) => {
      if (prev.has(id) === has) return prev
      const next = new Set(prev)
      if (has) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const selected =
    stations?.find((s) => s.id === selId) ?? stations?.find((s) => !s.is_case) ?? stations?.[0] ?? null
  const ready = (s: Station) => isReady(s) || withCurve.has(s.id)

  return (
    <div className="st">
      <header className="st-head">
        <h1 className="st-title">Станции и турбины</h1>
        <p className="st-intro muted">
          Три шага: добавьте турбины → загрузите историю по месяцам → модель пересчитается сама, и можно сделать прогноз
          на 48 ч.
        </p>
      </header>
      <Notice tone="info">
        Станция из ТЗ — полная модель (вкладка «Прогноз»). Новые станции — упрощённая: кривая мощности по истории +
        погода Open-Meteo.
      </Notice>

      {error && (
        <Notice
          tone="error"
          action={
            <button className="btn btn-sm" onClick={load}>
              Повторить
            </button>
          }
        >
          Не удалось загрузить список станций: {error}
        </Notice>
      )}
      {!stations && !error && <Spinner label="Загружаем станции…" />}

      {stations && (
        <div className="st-layout">
          <aside className="st-side">
            <button
              type="button"
              className={`btn btn-sm st-new-btn${showNew ? ' st-new-btn-on' : ''}`}
              onClick={() => setShowNew((v) => !v)}
              aria-expanded={showNew}
            >
              <Plus size={14} /> Новая станция
            </button>
            {showNew && (
              <NewStationForm
                onCreated={(s) => {
                  setSelId(s.id)
                  setShowNew(false)
                  load()
                }}
              />
            )}
            {stations.length === 0 && <Empty icon={<Wind size={24} />} title="Станций пока нет" />}
            <div className="st-list" role="list">
              {stations.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="listitem"
                  className={`st-item${selected?.id === s.id ? ' st-item-on' : ''}`}
                  aria-current={selected?.id === s.id ? 'true' : undefined}
                  onClick={() => setSelId(s.id)}
                >
                  <span className="st-item-top">
                    <b className="st-item-name">{s.name}</b>
                    <StatusBadge station={s} ready={ready(s)} />
                  </span>
                  <span className="st-item-meta muted">
                    турбин: {s.turbines.length} · история: {stationPeriod(s)}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          {selected && (
            <StationDetail
              key={selected.id}
              station={selected}
              ready={ready(selected)}
              theme={theme}
              onChanged={load}
              onCurve={onCurve}
            />
          )}
        </div>
      )}
    </div>
  )
}

/* ---------- форма «Новая станция» ---------- */

function NewStationForm({ onCreated }: { onCreated: (s: Station) => void }) {
  const [name, setName] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [region, setRegion] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    api<Station>('/api/stations', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), latitude: toNum(lat), longitude: toNum(lon), region: region.trim() }),
    })
      .then((s) => onCreated(s))
      .catch((err) => setMsg(errText(err)))
      .finally(() => setBusy(false))
  }

  return (
    <form className="st-form st-form-box" onSubmit={submit}>
      <label className="st-field st-field-wide">
        <span>Название</span>
        <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="st-field">
        <span>Широта</span>
        <input className="st-input" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} required placeholder="43.25" />
      </label>
      <label className="st-field">
        <span>Долгота</span>
        <input className="st-input" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} required placeholder="76.95" />
      </label>
      <label className="st-field st-field-wide">
        <span>Регион</span>
        <input className="st-input" value={region} onChange={(e) => setRegion(e.target.value)} />
      </label>
      <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !name.trim() || !validCoord(lat) || !validCoord(lon)}>
        <Plus size={14} /> Добавить станцию
      </button>
      {msg && <Notice tone="error">{msg}</Notice>}
    </form>
  )
}

const toNum = (s: string) => Number(s.trim().replace(',', '.'))
const validCoord = (s: string) => s.trim() !== '' && Number.isFinite(toNum(s))

/* ---------- выбранная станция ---------- */

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="st-step">
      <h3 className="st-step-head">
        <span className="st-step-num" aria-hidden="true">
          {n}
        </span>
        {title}
      </h3>
      <div className="st-step-body">{children}</div>
    </section>
  )
}

function TurbineList({ turbines }: { turbines: Turbine[] }) {
  if (turbines.length === 0) return <p className="muted st-empty">Турбин пока нет — добавьте первую.</p>
  return (
    <ul className="st-tlist">
      {turbines.map((tb) => (
        <li key={tb.id} className="st-trow">
          <b>{tb.name}</b>
          <span className="muted">{coords(tb.latitude, tb.longitude)}</span>
          <span>
            строк: <b className="mono">{int(tb.history_rows)}</b>
          </span>
          <span className="muted">{period(tb.history_start, tb.history_end)}</span>
        </li>
      ))}
    </ul>
  )
}

function StationDetail({
  station,
  ready,
  theme,
  onChanged,
  onCurve,
}: {
  station: Station
  ready: boolean
  theme: Theme
  onChanged: () => void
  onCurve: (id: number, has: boolean) => void
}) {
  const [curve, setCurve] = useState<Curve | null>(null)
  const [curveVer, setCurveVer] = useState(0)
  const [showTb, setShowTb] = useState(false)
  const [tbSel, setTbSel] = useState<number | null>(null)

  useEffect(() => {
    if (station.is_case) return
    let alive = true
    api<Curve>(`/api/stations/${station.id}/curve`)
      .then((c) => {
        if (!alive) return
        setCurve(c)
        onCurve(station.id, c.points.length > 0)
      })
      .catch(() => alive && setCurve(null)) // 404 — истории ещё нет
    return () => {
      alive = false
    }
  }, [station.id, station.is_case, curveVer, onCurve])

  const afterUpload = () => {
    setCurveVer((v) => v + 1)
    onChanged()
  }

  const tbs = station.turbines
  const tbId = tbs.some((t) => t.id === tbSel) ? tbSel : (tbs[0]?.id ?? null)
  const tb = tbs.find((t) => t.id === tbId) ?? null
  const hasCurve = curve != null && curve.points.length > 0

  return (
    <Card
      className="st-detail"
      title={station.name}
      actions={<StatusBadge station={station} ready={ready || hasCurve} />}
    >
      <p className="st-meta muted">
        {coords(station.latitude, station.longitude)}
        {station.region && ` · ${station.region}`} · {station.model_status || '—'}
      </p>

      {station.is_case ? (
        <>
          <Notice tone="info">
            Станция из ТЗ — полная модель, прогноз на вкладке «Прогноз». Загрузка истории для неё не нужна.
          </Notice>
          <TurbineList turbines={tbs} />
        </>
      ) : (
        <div className="st-steps">
          <Step n={1} title="Турбины">
            <TurbineList turbines={tbs} />
            <button
              type="button"
              className="btn btn-sm st-add-btn"
              onClick={() => setShowTb((v) => !v)}
              aria-expanded={showTb}
            >
              <Plus size={14} /> Добавить турбину
            </button>
            {showTb && (
              <NewTurbineForm
                stationId={station.id}
                onCreated={() => {
                  setShowTb(false)
                  onChanged()
                }}
              />
            )}
          </Step>

          <Step n={2} title="Загрузка истории">
            {tb ? (
              <>
                <label className="st-tb-pick">
                  <span>Турбина:</span>
                  <select className="st-input st-select" value={tb.id} onChange={(e) => setTbSel(Number(e.target.value))}>
                    {tbs.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <UploadBox key={tb.id} turbineId={tb.id} turbineName={tb.name} canUpload onUploaded={afterUpload} />
              </>
            ) : (
              <p className="muted st-empty">Сначала добавьте турбину в шаге 1.</p>
            )}
          </Step>

          <Step n={3} title="Модель и прогноз">
            {hasCurve || ready ? (
              <>
                {hasCurve && curve && <CurveChart curve={curve} theme={theme} />}
                <ForecastBlock stationId={station.id} theme={theme} />
              </>
            ) : (
              <p className="muted st-empty">Появится после загрузки истории в шаге 2.</p>
            )}
          </Step>
        </div>
      )}
    </Card>
  )
}

/* ---------- форма «Добавить турбину» ---------- */

function NewTurbineForm({ stationId, onCreated }: { stationId: number; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    api<Station>(`/api/stations/${stationId}/turbines`, {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), latitude: toNum(lat), longitude: toNum(lon) }),
    })
      .then(() => {
        setName('')
        setLat('')
        setLon('')
        onCreated()
      })
      .catch((err) => setError(errText(err)))
      .finally(() => setBusy(false))
  }

  return (
    <form className="st-form st-form-box" onSubmit={submit}>
      <label className="st-field st-field-wide">
        <span>Имя</span>
        <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="st-field">
        <span>Широта</span>
        <input className="st-input" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} required />
      </label>
      <label className="st-field">
        <span>Долгота</span>
        <input className="st-input" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} required />
      </label>
      <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !name.trim() || !validCoord(lat) || !validCoord(lon)}>
        <Plus size={14} /> Добавить
      </button>
      {error && <Notice tone="error">{error}</Notice>}
    </form>
  )
}

/* ---------- кривая мощности ---------- */

function CurveChart({ curve, theme }: { curve: Curve; theme: Theme }) {
  const option = useMemo<ChartOption>(() => {
    const c = readColors(theme)
    const pts = [...curve.points].sort((a, b) => a.wind - b.wind)
    return {
      animation: false,
      grid: { left: 44, right: 12, top: 12, bottom: 32 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: c.surface,
        borderColor: c.border,
        textStyle: { color: c.text, fontSize: 12 },
        formatter: (ps: { dataIndex: number }[]) => {
          const p = pts[ps[0]?.dataIndex ?? 0]
          return p
            ? `Ветер ${esc(num(p.wind))} м/с<br/>Медиана: <b>${esc(pct(p.p50))}</b><br/>Диапазон: ${esc(pct(p.p10))}–${esc(pct(p.p90))}<br/>Часов: ${esc(int(p.n))}`
            : ''
        },
      },
      xAxis: {
        type: 'value',
        name: 'м/с',
        nameGap: 6,
        nameTextStyle: { color: c.text3, fontSize: 11 },
        axisLabel: { color: c.text3, fontSize: 11 },
        axisLine: { lineStyle: { color: c.border } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 1,
        interval: 0.25,
        axisLabel: { color: c.text3, fontSize: 11, formatter: (v: number) => pct(v) },
        splitLine: { lineStyle: { color: c.border, type: 'dashed' } },
      },
      series: bandSeries(pts.map((p) => [p.wind, p.p10, p.p50, p.p90]), c),
    }
  }, [curve, theme])

  return (
    <div className="st-chart">
      <div className="st-chart-cap muted">
        Кривая мощности станции по {int(curve.hours)} ч истории, период {period(...curve.period)}
      </div>
      <EChart option={option} height={200} theme={theme} ariaLabel="Кривая мощности станции" />
    </div>
  )
}

/** Полоса p10–p90 (стек из двух линий) + линия p50. Строки: [x, p10, p50, p90]. */
function bandSeries(rows: number[][], c: ReturnType<typeof readColors>) {
  return [
    {
      type: 'line',
      stack: 'band',
      data: rows.map((r) => [r[0], r[1]]),
      symbol: 'none',
      lineStyle: { opacity: 0 },
      silent: true,
      z: 1,
    },
    {
      type: 'line',
      stack: 'band',
      data: rows.map((r) => [r[0], Math.max(0, r[3] - r[1])]),
      symbol: 'none',
      lineStyle: { opacity: 0 },
      areaStyle: { color: c.band, opacity: 1 },
      silent: true,
      z: 1,
    },
    {
      type: 'line',
      data: rows.map((r) => [r[0], r[2]]),
      showSymbol: false,
      lineStyle: { color: c.primary, width: 2 },
      itemStyle: { color: c.primary },
      z: 3,
    },
  ]
}

/* ---------- прогноз на 48 ч ---------- */

function ForecastBlock({ stationId, theme }: { stationId: number; theme: Theme }) {
  const [fc, setFc] = useState<StationForecast | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = () => {
    setBusy(true)
    setError(null)
    api<StationForecast>(`/api/stations/${stationId}/forecast`, { method: 'POST', body: '{}' })
      .then(setFc)
      .catch((e) => setError(errText(e)))
      .finally(() => setBusy(false))
  }

  const option = useMemo<ChartOption | null>(() => {
    if (!fc) return null
    const c = readColors(theme)
    const hs = fc.hours
    return {
      animation: false,
      grid: { left: 44, right: 12, top: 12, bottom: 32 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: c.surface,
        borderColor: c.border,
        textStyle: { color: c.text, fontSize: 12 },
        formatter: (ps: { dataIndex: number }[]) => {
          const h = hs[ps[0]?.dataIndex ?? 0]
          return h
            ? `${esc(dateTime(h.time))}<br/>Мощность: <b>${esc(pct(h.p50))}</b> (${esc(pct(h.p10))}–${esc(pct(h.p90))})<br/>Ветер 100 м: ${esc(num(h.wind_100m))} м/с`
            : ''
        },
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: Math.max(hs.length - 1, 1),
        interval: 6,
        axisLabel: { color: c.text3, fontSize: 11, formatter: (i: number) => (hs[i] ? dateTime(hs[i].time) : '') },
        axisLine: { lineStyle: { color: c.border } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 1,
        interval: 0.25,
        axisLabel: { color: c.text3, fontSize: 11, formatter: (v: number) => pct(v) },
        splitLine: { lineStyle: { color: c.border, type: 'dashed' } },
      },
      series: bandSeries(hs.map((h, i) => [i, h.p10, h.p50, h.p90]), c),
    }
  }, [fc, theme])

  return (
    <div className="st-forecast">
      <button className="btn btn-primary btn-sm" onClick={run} disabled={busy}>
        {busy ? <Spinner size={14} /> : <Wind size={14} />} Прогноз на 48 ч
      </button>
      {error && <Notice tone="warn">{error}</Notice>}
      {fc && option && (
        <>
          <p className="st-summary">
            Завтра: <b>{hoursFull(fc.summary.energy_d1)}</b> работы на полную мощность, послезавтра:{' '}
            <b>{hoursFull(fc.summary.energy_d2)}</b>
            {fc.summary.peak_hour && <>, пик — {fc.summary.peak_hour.includes('-') ? dateTime(fc.summary.peak_hour) : fc.summary.peak_hour}</>}.
          </p>
          <EChart option={option} height={220} theme={theme} ariaLabel="Прогноз мощности станции на 48 часов" />
          <p className="st-note muted">
            {fc.note}
            {fc.note && ' '}
            Модель: {fc.model}. Погода: {fc.weather_source}. Выпуск: {dateTime(fc.issued_at)}.
          </p>
        </>
      )}
    </div>
  )
}
