// Скачивание CSV февраля через GET /api/backtest/csv?kind=all|final (контракт v2) и описание формата файлов.
// Пока эндпоинта нет (v1) — честное сообщение и путь к готовому файлу в репозитории.

import { Fragment, useState, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import { backtestCsvUrl } from '../../api/endpoints'
import { Notice, Spinner } from '../../components/ui'
import { useT } from '../../i18n'
import { int } from '../../lib/format'

type Kind = 'all' | 'final'

const FILE: Record<Kind, string> = {
  all: 'outputs/forecast_feb2026.csv',
  final: 'outputs/forecast_feb2026_final.csv',
}

// описания колонок — в словаре february.dl.cols
const COLS_ALL = ['issue_date', 'issued_at', 'time', 'lead_day', 'p50', 'p10', 'p90', 't1', 't2', 'curve', 'wind_100m', 'actual'] as const

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

/** Строка словаря с {плейсхолдерами} → узлы React (подставляет элементы вместо {name}). */
function rich(s: string, nodes: Record<string, ReactNode>): ReactNode {
  return s.split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part)
    return m && m[1] in nodes ? <Fragment key={i}>{nodes[m[1]]}</Fragment> : part
  })
}

type Msg = { tone: 'warn' | 'error' | 'ok'; text: string }

export function FebDownloads(props: { runs: number }) {
  const { t } = useT()
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
            ? t('february.dl.unavailable', { file: FILE[kind] })
            : t('february.dl.errorFile', { detail: detail ?? t('february.dl.errorStatus', { status: res.status }), file: FILE[kind] }),
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
      setMsg({ tone: 'ok', text: t('february.dl.done', { name }) })
    } catch (e) {
      setMsg({ tone: 'error', text: t('february.dl.failed', { error: (e as Error).message }) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="feb-dl">
      <div className="feb-dl-actions">
        <button type="button" className="btn" disabled={busy != null} onClick={() => download('all')}>
          {busy === 'all' ? <Spinner /> : <Download size={16} aria-hidden />}
          {t('february.dl.all', { rows: t('february.dl.rows', { count: rowsAll, n: int(rowsAll) }) })}
        </button>
        <button type="button" className="btn" disabled={busy != null} onClick={() => download('final')}>
          {busy === 'final' ? <Spinner /> : <Download size={16} aria-hidden />}
          {t('february.dl.final', { n: int(hoursFinal) })}
        </button>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <details className="feb-format">
        <summary>{t('february.dl.format')}</summary>
        <p className="small muted">{t('february.dl.formatText')}</p>
        <div className="small">
          {rich(
            t('february.dl.allDesc', {
              rows: t('february.dl.rows', { count: rowsAll, n: int(rowsAll) }),
              runs: t('february.runs', { count: props.runs, n: int(props.runs) }),
            }),
            { file: <code>{FILE.all}</code> },
          )}
        </div>
        <dl className="feb-cols">
          {COLS_ALL.map((k) => (
            <div key={k}>
              <dt>
                <code>{k}</code>
              </dt>
              <dd>{t(`february.dl.cols.${k}`)}</dd>
            </div>
          ))}
        </dl>
        <div className="small">
          {rich(t('february.dl.finalDesc', { rows: t('february.dl.rows', { count: hoursFinal, n: int(hoursFinal) }) }), {
            file: <code>{FILE.final}</code>,
            cols: <code>{COLS_FINAL}</code>,
          })}
        </div>
      </details>
    </div>
  )
}
