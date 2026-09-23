// Скачивание CSV февраля через GET /api/backtest/csv?kind=all|final (контракт v2) и описание формата файлов.
// Пока эндпоинта нет (v1) — честное сообщение и путь к готовому файлу в репозитории.

import { useState } from 'react'
import { Download } from 'lucide-react'
import { backtestCsvUrl } from '../../api/endpoints'
import { Notice, Spinner } from '../../components/ui'
import { int, plural } from './febData'

type Kind = 'all' | 'final'

const FILE: Record<Kind, string> = {
  all: 'outputs/forecast_feb2026.csv',
  final: 'outputs/forecast_feb2026_final.csv',
}

const COLS_ALL: [string, string][] = [
  ['issue_date', 'дата выпуска D — прогноз сделан в конце этого дня'],
  ['issued_at', 'момент прогноза: D 23:59'],
  ['time', 'начало часа, к которому относится значение'],
  ['lead_day', '1 — сутки D+1, 2 — сутки D+2'],
  ['p50', 'прогноз мощности станции (медиана), доля номинала 0–1'],
  ['p10', 'нижняя граница интервала неуверенности, доля номинала'],
  ['p90', 'верхняя граница интервала неуверенности, доля номинала'],
  ['t1', 'прогноз по турбине 1, доля номинала'],
  ['t2', 'прогноз по турбине 2, доля номинала'],
  ['curve', 'базовый метод «кривая мощности по прогнозному ветру», доля номинала'],
  ['wind_100m', 'прогнозный ветер на 100 м из архивного прогноза погоды, м/с'],
  ['actual', 'факт станции; для февраля 2026 пусто — факта нет'],
]

const COLS_FINAL = 'time, p50, p10, p90, t1, t2, issue_date'

function fileName(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition)
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
    } catch {
      /* кривое имя — ниже обычный filename */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition)
  return plain ? plain[1].trim() : fallback
}

type Msg = { tone: 'warn' | 'error' | 'ok'; text: string }

export function FebDownloads(props: { runs: number }) {
  const [busy, setBusy] = useState<Kind | null>(null)
  const [msg, setMsg] = useState<Msg | null>(null)
  const rowsAll = props.runs * 48
  const hoursFinal = props.runs * 24

  const download = async (kind: Kind) => {
    setBusy(kind)
    setMsg(null)
    try {
      const res = await fetch(backtestCsvUrl(kind))
      const type = res.headers.get('content-type') ?? ''
      if (!res.ok || type.includes('text/html') || type.includes('application/json')) {
        const body = type.includes('application/json') ? await res.json().catch(() => null) : null
        const detail: string | undefined = body?.detail
        const noEndpoint = res.status === 405 || (res.status === 404 && (!detail || detail === 'Не найдено')) || res.ok
        setMsg({
          tone: 'warn',
          text: noEndpoint
            ? `Скачивание из интерфейса пока недоступно. Файл лежит в репозитории: ${FILE[kind]}`
            : `${detail ?? `Ошибка ${res.status}`}. Файл в репозитории: ${FILE[kind]}`,
        })
        return
      }
      const blob = await res.blob()
      const name = fileName(res.headers.get('content-disposition'), FILE[kind].split('/').pop() ?? 'forecast.csv')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMsg({ tone: 'ok', text: `Скачан ${name}` })
    } catch (e) {
      setMsg({ tone: 'error', text: `Не удалось скачать: ${(e as Error).message}` })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="feb-dl">
      <div className="feb-dl-actions">
        <button type="button" className="btn" disabled={busy != null} onClick={() => download('all')}>
          {busy === 'all' ? <Spinner /> : <Download size={16} aria-hidden />}
          Скачать CSV — все выпуски ({int(rowsAll)} {plural(rowsAll, ['строка', 'строки', 'строк'])})
        </button>
        <button type="button" className="btn" disabled={busy != null} onClick={() => download('final')}>
          {busy === 'final' ? <Spinner /> : <Download size={16} aria-hidden />}
          Итоговый ряд февраля ({int(hoursFinal)} ч)
        </button>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <details className="feb-format">
        <summary>Формат файла</summary>
        <p className="small muted">
          UTF-8, разделитель — запятая, десятичная точка. Время — местное время станции UTC+5, без смещения. Мощность — доля
          номинала 0–1 (МВт в данных нет).
        </p>
        <div className="small">
          <code>{FILE.all}</code> — одна строка = один час одного выпуска ({int(rowsAll)}{' '}
          {plural(rowsAll, ['строка', 'строки', 'строк'])}: {int(props.runs)} {plural(props.runs, ['выпуск', 'выпуска', 'выпусков'])}{' '}
          × 48 ч).
        </div>
        <dl className="feb-cols">
          {COLS_ALL.map(([k, v]) => (
            <div key={k}>
              <dt>
                <code>{k}</code>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="small">
          <code>{FILE.final}</code> — итоговый ряд: каждый час февраля из самого свежего выпуска (горизонт D+1), {int(hoursFinal)}{' '}
          {plural(hoursFinal, ['строка', 'строки', 'строк'])}. Колонки: <code>{COLS_FINAL}</code>.
        </div>
      </details>
    </div>
  )
}
