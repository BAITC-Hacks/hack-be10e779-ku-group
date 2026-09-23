// Вкладка «Станции»: станции и турбины, загрузка истории по месяцам (CSV), кривая мощности станции и прогноз на 48 ч.
// Для станции из ТЗ — только просмотр (полная модель во вкладке «Прогноз»); для новых — упрощённая модель на бэкенде.

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Upload, Wind } from 'lucide-react'
import { api } from '../../api/client'
import type { Theme } from '../../app/shared'
import { EChart, type ChartOption } from '../../components/EChart'
import { Badge, Card, Empty, Notice, Spinner } from '../../components/ui'
import { dateRu, dateTime, esc, hoursFull, int, num, pct } from '../../lib/format'
import { cssVar } from '../../lib/theme'
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
type UploadResult = {
  turbine_id: number
  files: { name: string; rows: number; period: [string, string] }[]
  total_rows: number
  period: [string, string]
  station_status: string
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

export default function StationsTab({ theme }: { theme: Theme }) {
  const [stations, setStations] = useState<Station[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="st">
      <header className="st-head">
        <h1 className="st-title">Станции и турбины</h1>
        <p className="st-intro muted">
          Добавьте станцию и турбины, загрузите историю по месяцам — модель станции пересчитается сама, и можно сделать
          прогноз на 48 часов.
        </p>
      </header>
      <Notice tone="info">
        Для станции из ТЗ используется полная модель (вкладка «Прогноз»). Для новых станций — упрощённая модель: кривая
        мощности по загруженной истории + прогноз погоды Open-Meteo по координатам.
      </Notice>

      <NewStationForm onCreated={load} />

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
      {stations && stations.length === 0 && <Empty icon={<Wind size={24} />} title="Станций пока нет" />}
      {stations?.map((s) => <StationCard key={s.id} station={s} theme={theme} onChanged={load} />)}
    </div>
  )
}

/* ---------- форма «Новая станция» ---------- */

function NewStationForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [region, setRegion] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    api<Station>('/api/stations', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), latitude: toNum(lat), longitude: toNum(lon), region: region.trim() }),
    })
      .then((s) => {
        setMsg({ tone: 'ok', text: `Станция «${s.name}» добавлена.` })
        setName('')
        setLat('')
        setLon('')
        setRegion('')
        onCreated()
      })
      .catch((err) => setMsg({ tone: 'error', text: errText(err) }))
      .finally(() => setBusy(false))
  }

  return (
    <Card title="Новая станция">
      <form className="st-form" onSubmit={submit}>
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
        <button className="btn btn-primary" type="submit" disabled={busy || !name.trim() || !validCoord(lat) || !validCoord(lon)}>
          <Plus size={16} /> Добавить станцию
        </button>
      </form>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </Card>
  )
}

const toNum = (s: string) => Number(s.trim().replace(',', '.'))
const validCoord = (s: string) => s.trim() !== '' && Number.isFinite(toNum(s))

/* ---------- карточка станции ---------- */

function StationCard({ station, theme, onChanged }: { station: Station; theme: Theme; onChanged: () => void }) {
  const [curve, setCurve] = useState<Curve | null>(null)
  const [curveVer, setCurveVer] = useState(0)

  useEffect(() => {
    let alive = true
    api<Curve>(`/api/stations/${station.id}/curve`)
      .then((c) => alive && setCurve(c))
      .catch(() => alive && setCurve(null)) // 404 — истории ещё нет
    return () => {
      alive = false
    }
  }, [station.id, curveVer])

  const afterUpload = () => {
    setCurveVer((v) => v + 1)
    onChanged()
  }

  const noHistory = station.model_status.toLowerCase().startsWith('нет')

  return (
    <Card
      className="st-card"
      title={
        <span className="st-card-title">
          {station.name}
          {station.is_case && <Badge tone="info">станция из ТЗ</Badge>}
        </span>
      }
      actions={
        <Badge tone={noHistory ? 'warn' : 'ok'} title="Состояние модели станции">
          {station.model_status || '—'}
        </Badge>
      }
    >
      <p className="st-meta muted">
        {coords(station.latitude, station.longitude)}
        {station.region && ` · ${station.region}`} · турбин: {station.turbines.length}
      </p>

      {station.turbines.length > 0 ? (
        <div className="st-turbines">
          {station.turbines.map((tb) => (
            <TurbineRow key={tb.id} turbine={tb} canUpload={!station.is_case} onUploaded={afterUpload} />
          ))}
        </div>
      ) : (
        <p className="muted st-empty">Турбин пока нет — добавьте первую.</p>
      )}

      {!station.is_case && <NewTurbineForm stationId={station.id} onCreated={onChanged} />}

      {curve && curve.points.length > 0 && <CurveChart curve={curve} theme={theme} />}

      {!station.is_case && <ForecastBlock stationId={station.id} theme={theme} />}
    </Card>
  )
}

/* ---------- турбина + загрузка месяцев ---------- */

function TurbineRow({ turbine, canUpload, onUploaded }: { turbine: Turbine; canUpload: boolean; onUploaded: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [inputKey, setInputKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const upload = () => {
    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))
    setBusy(true)
    setError(null)
    setResult(null)
    api<UploadResult>(`/api/turbines/${turbine.id}/history/months`, { method: 'POST', body: fd })
      .then((r) => {
        setResult(r)
        setFiles([])
        setInputKey((k) => k + 1)
        onUploaded()
      })
      .catch((e) => setError(errText(e)))
      .finally(() => setBusy(false))
  }

  return (
    <div className="st-turbine">
      <div className="st-turbine-info">
        <b>{turbine.name}</b>
        <span className="muted">{coords(turbine.latitude, turbine.longitude)}</span>
        <span>
          строк истории: <b className="mono">{int(turbine.history_rows)}</b>
        </span>
        <span className="muted">период: {period(turbine.history_start, turbine.history_end)}</span>
      </div>

      {canUpload && (
        <div className="st-upload">
          <input
            key={inputKey}
            type="file"
            multiple
            accept=".csv"
            aria-label={`CSV-файлы истории для ${turbine.name}`}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          <button className="btn btn-sm" onClick={upload} disabled={busy || files.length === 0}>
            {busy ? <Spinner size={14} /> : <Upload size={14} />} Загрузить месяцы
          </button>
        </div>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {result && (
        <Notice tone="ok">
          <div>
            Загружено строк: <b>{int(result.total_rows)}</b>, период истории: {period(...result.period)}.
          </div>
          <ul className="st-files">
            {result.files.map((f) => (
              <li key={f.name}>
                {f.name} — {int(f.rows)} строк, {period(...f.period)}
              </li>
            ))}
          </ul>
          <div>Статус станции: {result.station_status}</div>
        </Notice>
      )}
    </div>
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
    <form className="st-form st-form-sub" onSubmit={submit}>
      <div className="eyebrow st-form-label">Добавить турбину</div>
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
      <button className="btn btn-sm" type="submit" disabled={busy || !name.trim() || !validCoord(lat) || !validCoord(lon)}>
        <Plus size={14} /> Добавить турбину
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
