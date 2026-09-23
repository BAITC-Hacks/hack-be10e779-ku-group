import { useCallback, useEffect, useState } from 'react'
import { Info, Moon, Sun } from 'lucide-react'
import { getHealth, getMeta, getMetrics } from './api/endpoints'
import type { Health, Meta, Metrics } from './api/types'
import type { Theme } from './app/shared'
import { Badge, Notice, Spinner } from './components/ui'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SiteFooter } from './components/SiteFooter'
import { BrandMark } from './components/BrandMark'
import { DEFAULT_ISSUE_DATE, DEFAULT_META } from './lib/constants'
import { num } from './lib/format'
import ForecastTab from './features/forecast/ForecastTab'
import FebruaryTab from './features/february/FebruaryTab'
import QualityTab from './features/quality/QualityTab'
import AboutModal from './features/about/AboutModal'
import './App.css'

type Tab = 'forecast' | 'february' | 'quality'
const TABS: { id: Tab; label: string }[] = [
  { id: 'forecast', label: 'Прогноз' },
  { id: 'february', label: 'Февраль 2026' },
  { id: 'quality', label: 'Качество модели' },
]

function initialTheme(): Theme {
  let t: Theme = 'dark'
  try {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') t = saved
  } catch {
    /* хранилище недоступно — тема по умолчанию */
  }
  // атрибут ставим сразу, до рендера вкладок: графики читают цвета из CSS-переменных во время рендера
  document.documentElement.dataset.theme = t
  return t
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [tab, setTab] = useState<Tab>('forecast')
  const [health, setHealth] = useState<Health | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [meta, setMeta] = useState<Meta>(DEFAULT_META)
  const [issueDate, setIssueDate] = useState(DEFAULT_ISSUE_DATE)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [metricsState, setMetricsState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next // до setState — см. initialTheme
    setTheme(next)
    try {
      localStorage.setItem('theme', next)
    } catch {
      /* не критично */
    }
  }

  const connect = useCallback(() => {
    setServerError(null)
    getHealth()
      .then(async (h) => {
        setHealth(h)
        setMeta(await getMeta(h))
      })
      .catch((e: Error) => setServerError(e.message))
  }, [])

  const loadMetrics = useCallback(() => {
    setMetricsState('loading')
    getMetrics()
      .then((m) => {
        setMetrics(m)
        setMetricsState(m ? 'ready' : 'missing')
      })
      .catch((e: Error) => {
        setMetricsError(e.message)
        setMetricsState('error')
      })
  }, [])

  useEffect(() => {
    connect()
    loadMetrics()
  }, [connect, loadMetrics])

  const openForecast = useCallback((d: string) => {
    setIssueDate(d)
    setTab('forecast')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const mode = meta.mode ?? health?.mode ?? 'demo'
  const headline = headlineMetric(metrics)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <BrandMark size={26} />
          </span>
          <div>
            <div className="brand-name">Анемо</div>
            <div className="brand-sub">
              {meta.station.name} · время станции UTC+5
            </div>
          </div>
        </div>

        <nav className="tabs" aria-label="Разделы">
          {TABS.map((t) => (
            <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          {headline && (
            <button className="headline" onClick={() => setTab('quality')} title={`MAE прогноза на сутки вперёд, % номинала · ${metrics?.holdout ?? ''} · подробнее — вкладка «Качество модели»`}>
              <span className="eyebrow">Ошибка прогноза на завтра</span>
              <span className="mono">
                {num(headline.model * 100)} % <span className="muted">vs {num(headline.curve * 100)} % у простого расчёта</span>
              </span>
            </button>
          )}
          {health ? (
            <Badge
              tone={mode === 'live' ? 'live' : 'demo'}
              title={
                mode === 'live'
                  ? 'Решения о шагах принимает LLM через вызовы инструментов. Числа считает код.'
                  : 'Ключ LLM не задан: тот же цикл проходит детерминированный планировщик. Погода, модель и расчёты — настоящие.'
              }
            >
              <span className="dot" />
              {mode === 'live' ? 'LIVE' : 'DEMO'}
              <span className="hide-sm">
                {mode === 'live' ? ` · LLM${meta.llm_model ? `: ${meta.llm_model}` : ''}` : ' · без LLM'}
              </span>
            </Badge>
          ) : (
            !serverError && <Spinner label="Подключение…" />
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setAboutOpen(true)} aria-label="О системе">
            <Info size={16} /> <span className="hide-sm">О системе</span>
          </button>
        </div>
      </header>

      {serverError && (
        <div className="server-error">
          <Notice
            tone="error"
            action={
              <button className="btn btn-sm" onClick={connect}>
                Повторить
              </button>
            }
          >
            Сервер недоступен: {serverError}. Проверьте, что приложение запущено (<code>docker compose up</code>).
          </Notice>
        </div>
      )}

      <main>
        <div hidden={tab !== 'forecast'}>
          <ErrorBoundary name="Прогноз">
            <ForecastTab meta={meta} theme={theme} issueDate={issueDate} onIssueDateChange={setIssueDate} />
          </ErrorBoundary>
        </div>
        <div hidden={tab !== 'february'}>
          <ErrorBoundary name="Февраль 2026">
            <FebruaryTab meta={meta} theme={theme} onOpenDate={openForecast} />
          </ErrorBoundary>
        </div>
        <div hidden={tab !== 'quality'}>
          <ErrorBoundary name="Качество модели">
            <QualityTab
              theme={theme}
              metrics={metrics}
              metricsState={metricsState}
              metricsError={metricsError}
              onReload={loadMetrics}
            />
          </ErrorBoundary>
        </div>
      </main>

      <SiteFooter />

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} meta={meta} health={health} />
    </div>
  )
}

/** Для плашки в шапке: MAE модели и кривой мощности на горизонте D+1. */
function headlineMetric(m: Metrics | null): { model: number; curve: number } | null {
  if (!m) return null
  const d1 = m.rows.filter((r) => (r.lead ?? 'D+1') === 'D+1' && r.mae != null)
  const model = d1.find((r) => /модел/i.test(r.model))
  const curve = d1.find((r) => /кривая/i.test(r.model))
  return model?.mae != null && curve?.mae != null ? { model: model.mae, curve: curve.mae } : null
}
