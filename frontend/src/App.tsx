import { useCallback, useEffect, useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { getHealth, getMeta, getMetrics } from './api/endpoints'
import type { Health, Meta, Metrics } from './api/types'
import type { TabId, Theme } from './app/shared'
import { Badge, Notice, Spinner } from './components/ui'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SiteFooter } from './components/SiteFooter'
import { BrandMark } from './components/BrandMark'
import { LanguageSelector } from './components/LanguageSelector'
import { ThemeToggle } from './components/ThemeToggle'
import { useT, type TKey } from './i18n'
import * as themes from './lib/themeManager'
import { LoginBox } from './components/LoginBox'
import { DEFAULT_ISSUE_DATE, DEFAULT_META } from './lib/constants'
import { num } from './lib/format'
import ForecastTab from './features/forecast/ForecastTab'
import FebruaryTab from './features/february/FebruaryTab'
import QualityTab from './features/quality/QualityTab'
import AboutModal from './features/about/AboutModal'
import ProjectTab from './features/project/ProjectTab'
import StationsTab from './features/stations/StationsTab'
import './App.css'

type Tab = TabId
const TABS: { id: Tab; label: TKey }[] = [
  { id: 'forecast', label: 'app.tabs.forecast' },
  { id: 'february', label: 'app.tabs.february' },
  { id: 'quality', label: 'app.tabs.quality' },
  { id: 'stations', label: 'app.tabs.stations' },
  { id: 'project', label: 'app.tabs.project' },
]

export default function App() {
  const { t, locale } = useT()
  const [themeMode, setThemeMode] = useState<themes.ThemeMode>(themes.readMode)
  // тема применяется синхронно (до рендера вкладок): графики читают цвета из CSS-переменных во время рендера
  const [theme, setTheme] = useState<Theme>(() => {
    const r = themes.resolve(themes.readMode())
    themes.apply(r)
    return r
  })
  const [tab, setTab] = useState<Tab>('forecast')
  const [health, setHealth] = useState<Health | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [meta, setMeta] = useState<Meta>(DEFAULT_META)
  const [issueDate, setIssueDate] = useState(DEFAULT_ISSUE_DATE)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [metricsState, setMetricsState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)

  const changeThemeMode = (m: themes.ThemeMode) => {
    const r = themes.resolve(m)
    themes.apply(r) // до setState — см. выше
    themes.saveMode(m)
    setThemeMode(m)
    setTheme(r)
  }

  // заголовок вкладки браузера — на языке интерфейса
  useEffect(() => {
    document.title = t('app.brand.title')
  }, [t])

  // режим «как в системе»: следим за сменой темы ОС
  useEffect(() => {
    if (themeMode !== 'system') return
    return themes.onSystemChange((r) => {
      themes.apply(r)
      setTheme(r)
    })
  }, [themeMode])

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

  const openTab = useCallback((t: TabId) => {
    setTab(t)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const openForecast = useCallback((d: string) => {
    setIssueDate(d)
    setTab('forecast')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // подписи, которые API отдаёт по-русски, — на язык интерфейса перед передачей во вкладки
  const metaView = useMemo<Meta>(
    () => (locale === 'ru' ? meta : { ...meta, station: { ...meta.station, name: t('app.brand.station') } }),
    [meta, locale, t],
  )
  const metricsView = useMemo<Metrics | null>(
    () =>
      metrics && locale !== 'ru'
        ? { ...metrics, holdout: metrics.holdout.replace('скользящее окно', t('app.rollingWindow')) }
        : metrics,
    [metrics, locale, t],
  )

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
            <div className="brand-name">{t('app.brand.name')}</div>
            <div className="brand-sub">
              {locale === 'ru' ? meta.station.name : t('app.brand.station')} · {t('app.brand.tagline')}
            </div>
          </div>
        </div>

        <nav className="tabs" aria-label={t('app.tabs.aria')}>
          {TABS.map((tb) => (
            <button key={tb.id} className="tab" aria-current={tab === tb.id ? 'page' : undefined} onClick={() => setTab(tb.id)}>
              {t(tb.label)}
              {tb.id === 'stations' && (
                <span className="tab-badge" title={t('app.tabs.demoTitle')}>
                  {t('app.tabs.demoBadge')}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          {headline && (
            <button
              className="headline"
              onClick={() => setTab('quality')}
              title={t('app.headline.title', { period: metricsView?.holdout ?? '' })}
            >
              <span className="eyebrow">{t('app.headline.label')}</span>
              <span className="mono">
                {num(headline.model * 100)} %{' '}
                <span className="muted">{t('app.headline.vs', { value: `${num(headline.curve * 100)} %` })}</span>
              </span>
            </button>
          )}
          {health ? (
            <Badge
              tone={mode === 'live' ? 'live' : 'demo'}
              title={
                mode === 'live'
                  ? t('app.mode.liveTitle')
                  : t('app.mode.demoTitle')
              }
            >
              <span className="dot" />
              {mode === 'live' ? 'LIVE' : t('app.mode.check')}
              <span className="hide-sm">
                {mode === 'live' ? ` · LLM${meta.llm_model ? `: ${meta.llm_model}` : ''}` : ` ${t('app.mode.noKey')}`}
              </span>
            </Badge>
          ) : (
            !serverError && <Spinner label={t('app.connecting')} />
          )}
          <LanguageSelector />
          <ThemeToggle mode={themeMode} onChange={changeThemeMode} />
          <LoginBox />
          <button className="btn btn-ghost btn-sm" onClick={() => setAboutOpen(true)} aria-label={t('app.about')}>
            <Info size={16} /> <span className="hide-sm">{t('app.about')}</span>
          </button>
        </div>
      </header>

      {serverError && (
        <div className="server-error">
          <Notice
            tone="error"
            action={
              <button className="btn btn-sm" onClick={connect}>
                {t('app.server.retry')}
              </button>
            }
          >
            {t('app.server.unavailable', { error: serverError, command: 'docker compose up' })}
          </Notice>
        </div>
      )}

      <main>
        <div hidden={tab !== 'forecast'}>
          <ErrorBoundary name={t('app.tabs.forecast')}>
            <ForecastTab meta={metaView} theme={theme} issueDate={issueDate} onIssueDateChange={setIssueDate} />
          </ErrorBoundary>
        </div>
        <div hidden={tab !== 'february'}>
          <ErrorBoundary name={t('app.tabs.february')}>
            <FebruaryTab meta={metaView} theme={theme} onOpenDate={openForecast} />
          </ErrorBoundary>
        </div>
        <div hidden={tab !== 'quality'}>
          <ErrorBoundary name={t('app.tabs.quality')}>
            <QualityTab
              theme={theme}
              metrics={metricsView}
              metricsState={metricsState}
              metricsError={metricsError}
              onReload={loadMetrics}
            />
          </ErrorBoundary>
        </div>
        <div hidden={tab !== 'stations'}>
          <ErrorBoundary name={t('app.tabs.stations')}>
            <StationsTab theme={theme} />
          </ErrorBoundary>
        </div>
        <div hidden={tab !== 'project'}>
          <ErrorBoundary name={t('app.tabs.project')}>
            <ProjectTab meta={metaView} health={health} metrics={metricsView} onOpenTab={openTab} />
          </ErrorBoundary>
        </div>
      </main>

      <SiteFooter />

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} meta={metaView} health={health} />
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
