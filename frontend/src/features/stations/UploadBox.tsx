// Загрузка истории турбины (CSV по месяцам или одним файлом), проверка файлов и покрытие истории по месяцам.

import { useEffect, useRef, useState, type DragEvent } from 'react'
import { FileText, Upload, X } from 'lucide-react'
import { api } from '../../api/client'
import { Notice, Spinner } from '../../components/ui'
import { dateRu, int, num } from '../../lib/format'

type FileCheck = {
  name: string
  rows: number
  period: [string, string]
  step_min: number
  hours: number
  missing_hours: number
  power_out_of_range: number
  duplicates: number
  bad_time: number
}
type CoverageItem = { month: string; hours: number; expected: number }
type UploadResult = {
  turbine_id: number
  files: FileCheck[]
  total_rows: number
  period: [string, string]
  station_status: string
  curve: { hours: number; bins: number } | null
  coverage: CoverageItem[]
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const period = (p?: [string, string] | null) => (p && p[0] && p[1] ? `${dateRu(p[0])} — ${dateRu(p[1])}` : '—')
const size = (b: number) => (b >= 1024 * 1024 ? `${num(b / 1024 / 1024)} МБ` : `${num(b / 1024)} КБ`)
const isCsv = (f: File) => f.name.toLowerCase().endsWith('.csv')

export default function UploadBox({
  turbineId,
  turbineName,
  canUpload,
  onUploaded,
}: {
  turbineId: number
  turbineName: string
  canUpload: boolean
  onUploaded: () => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [coverage, setCoverage] = useState<CoverageItem[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    api<{ turbine_id: number; coverage: CoverageItem[] }>(`/api/turbines/${turbineId}/history/coverage`)
      .then((r) => alive && setCoverage(r.coverage ?? []))
      .catch(() => alive && setCoverage([])) // 404 — истории ещё нет
    return () => {
      alive = false
    }
  }, [turbineId])

  const add = (list: FileList | null) => {
    const picked = Array.from(list ?? []).filter(isCsv)
    if (!picked.length) return
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name))
      return [...prev, ...picked.filter((f) => !names.has(f.name))]
    })
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    add(e.dataTransfer.files)
  }

  const upload = () => {
    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))
    setBusy(true)
    setError(null)
    setResult(null)
    api<UploadResult>(`/api/turbines/${turbineId}/history/months`, { method: 'POST', body: fd })
      .then((r) => {
        setResult(r)
        setFiles([])
        if (r.coverage) setCoverage(r.coverage)
        onUploaded()
      })
      .catch((e) => setError(errText(e)))
      .finally(() => setBusy(false))
  }

  const hasCoverage = coverage != null && coverage.length > 0
  if (!canUpload && !hasCoverage) return null

  return (
    <div className="st-ub">
      {canUpload && (
        <>
          <div
            className={`st-drop${drag ? ' st-drop-on' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`Выбрать CSV-файлы истории для ${turbineName}`}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
          >
            <Upload size={20} />
            <div>
              <b>Перетащите файлы сюда</b> или <span className="st-drop-link">выберите файлы</span>
            </div>
            <p className="st-drop-hint muted">CSV: по месяцу в файле или вся история одним файлом.</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".csv"
              hidden
              onChange={(e) => {
                add(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
          <details className="st-fmt muted">
            <summary>формат столбцов</summary>
            Как у организатора: Статистическое время, Средняя скорость ветра(m/s), Нормализованная активная мощность,
            Средняя температура окружающей среды(°C).
          </details>

          {files.length > 0 && (
            <ul className="st-picked">
              {files.map((f) => (
                <li key={f.name}>
                  <FileText size={14} />
                  <span className="st-picked-name">{f.name}</span>
                  <span className="muted mono">{size(f.size)}</span>
                  <button
                    type="button"
                    className="st-picked-x"
                    aria-label={`Убрать ${f.name}`}
                    title="Убрать"
                    disabled={busy}
                    onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="st-ub-actions">
            <button className="btn btn-primary btn-sm" onClick={upload} disabled={busy || files.length === 0}>
              {busy ? <Spinner size={14} /> : <Upload size={14} />}{' '}
              {files.length > 0 ? `Загрузить ${files.length} ${plural(files.length)}` : 'Загрузить файлы'}
            </button>
            {busy && <span className="muted">Загружаем и пересчитываем модель…</span>}
          </div>

          {error && <Notice tone="error">{error}</Notice>}
          {result && (
            <>
              <Notice tone="ok">
                История обновлена: всего {int(result.total_rows)} строк, период {period(result.period)}. Статус
                модели станции: {result.station_status}
              </Notice>
              <div className="st-check">
                <div className="eyebrow">Проверка файлов</div>
                <div className="st-table-wrap">
                  <table className="st-table">
                    <thead>
                      <tr>
                        <th>Файл</th>
                        <th>Строк</th>
                        <th>Период</th>
                        <th>Шаг, мин</th>
                        <th>Пропуски, ч</th>
                        <th>Мощность вне 0–100 %</th>
                        <th>Повторы</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.files.map((f) => (
                        <tr key={f.name}>
                          <td className={f.bad_time > 0 ? 'st-bad' : undefined} title={f.bad_time > 0 ? `Строк с ошибкой во времени: ${f.bad_time}` : undefined}>
                            {f.name}
                          </td>
                          <td className="mono">{int(f.rows)}</td>
                          <td>{period(f.period)}</td>
                          <td className="mono">{num(f.step_min, 0)}</td>
                          <td className={`mono${f.missing_hours > 0 ? ' st-bad' : ''}`}>{int(f.missing_hours)}</td>
                          <td className={`mono${f.power_out_of_range > 0 ? ' st-bad' : ''}`}>{int(f.power_out_of_range)}</td>
                          <td className={`mono${f.duplicates > 0 ? ' st-bad' : ''}`}>{int(f.duplicates)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <CoverageGrid coverage={coverage} />
    </div>
  )
}

function plural(n: number) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'файл'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'файла'
  return 'файлов'
}

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MONTHS_FULL = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

function level(hours: number, expected: number) {
  if (!hours || !expected) return 'none'
  const r = hours / expected
  if (r >= 0.95) return 'full'
  if (r >= 0.5) return 'part'
  return 'low'
}

function CoverageGrid({ coverage }: { coverage: CoverageItem[] | null }) {
  if (coverage == null) return <Spinner size={14} label="Проверяем покрытие истории…" />
  const map = new Map(coverage.map((c) => [c.month, c]))
  const years = [...new Set(coverage.map((c) => Number(c.month.slice(0, 4))))].filter(Number.isFinite).sort()

  return (
    <div className="st-cov">
      <div className="eyebrow">Покрытие по месяцам</div>
      {years.length === 0 ? (
        <p className="muted st-cov-empty">История ещё не загружена</p>
      ) : (
        <>
          <div className="st-cov-grid" role="table" aria-label="Покрытие истории по месяцам">
            <div className="st-cov-row" role="row">
              <span className="st-cov-year" />
              {MONTHS_SHORT.map((m) => (
                <span key={m} className="st-cov-mon muted" role="columnheader">
                  {m}
                </span>
              ))}
            </div>
            {years.map((y) => (
              <div key={y} className="st-cov-row" role="row">
                <span className="st-cov-year mono" role="rowheader">
                  {y}
                </span>
                {MONTHS_SHORT.map((_, i) => {
                  const key = `${y}-${String(i + 1).padStart(2, '0')}`
                  const c = map.get(key)
                  const lv = c ? level(c.hours, c.expected) : 'none'
                  const title = c
                    ? `${MONTHS_FULL[i]} ${y}: ${int(c.hours)} из ${int(c.expected)} ч`
                    : `${MONTHS_FULL[i]} ${y}: нет данных`
                  return <span key={key} className={`st-cov-cell st-cov-${lv}`} title={title} role="cell" aria-label={title} />
                })}
              </div>
            ))}
          </div>
          <div className="st-cov-legend muted">
            <span>
              <i className="st-cov-cell st-cov-full" /> полный
            </span>
            <span>
              <i className="st-cov-cell st-cov-part" /> частичный
            </span>
            <span>
              <i className="st-cov-cell st-cov-low" /> мало данных
            </span>
            <span>
              <i className="st-cov-cell st-cov-none" /> нет
            </span>
          </div>
        </>
      )}
    </div>
  )
}
