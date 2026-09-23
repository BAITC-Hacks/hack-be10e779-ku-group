// Вкладка «Качество модели»: проверка на прошлых месяцах (факта за февраль 2026 нет).
// Данные: metrics — /api/metrics (грузит App; v1 и v2 разбирает model.ts), график «прогноз против факта» — /api/holdout
// или, пока его нет, /api/history. Все числа — из API.

import { useMemo } from 'react'
import { ChartColumn, RefreshCw, Target } from 'lucide-react'
import type { QualityTabProps } from '../../app/shared'
import { EChart } from '../../components/EChart'
import { Card, Empty, Notice, Skeleton } from '../../components/ui'
import { useT } from '../../i18n'
import { maeBarsOption } from './charts'
import { Contrast } from './Contrast'
import { CoverageBlock } from './CoverageBlock'
import { HoldoutCard } from './HoldoutCard'
import { MetricsTable } from './MetricsTable'
import { parseMetrics, rich } from './model'
import './quality.css'

export default function QualityTab(props: QualityTabProps) {
  const { metrics, metricsState, theme } = props
  const { t, locale } = useT()
  const data = useMemo(() => (metrics ? parseMetrics(metrics) : null), [metrics])
  const barsOption = useMemo(
    () => (data && data.groups.length > 0 ? maeBarsOption(data.groups, theme, locale) : null),
    [data, theme, locale],
  )
  const [main, ...rest] = data?.groups ?? []
  const rolling = data ? /скользящ/i.test(data.holdout) : false

  return (
    <div className="q">
      <header className="q-head">
        <h1 className="q-title">{t('quality.tab.title')}</h1>
        {data && (
          <p className="q-period">
            {rich(t('quality.tab.period'), { period: <b>{data.holdout}</b> })}
            {rolling && <span className="muted">{t('quality.tab.rolling')}</span>}
          </p>
        )}
        <p className="q-intro muted">
          {t('quality.tab.intro')}
        </p>
      </header>

      {metricsState === 'loading' && (
        <div className="q-stack" aria-busy="true" aria-label={t('quality.tab.loadingAria')}>
          <Skeleton height={168} />
          <div className="q-grid">
            <Skeleton height={320} />
            <Skeleton height={320} />
          </div>
        </div>
      )}

      {metricsState === 'error' && (
        <Notice
          tone="error"
          action={
            <button className="btn btn-sm" onClick={props.onReload}>
              <RefreshCw size={14} /> {t('quality.tab.retry')}
            </button>
          }
        >
          {props.metricsError
            ? t('quality.tab.loadErrorWith', { error: props.metricsError })
            : t('quality.tab.loadError')}
        </Notice>
      )}

      {(metricsState === 'missing' || (metricsState === 'ready' && (!data || data.groups.length === 0))) && (
        <Card>
          <Empty icon={<ChartColumn size={28} aria-hidden />} title={t('quality.tab.emptyTitle')}>
            <p className="q-empty-hint">
              {rich(t('quality.tab.emptyHint'), {
                dir: <code>backend</code>,
                cmd: <code>python -m app.forecast.cli metrics</code>,
                file: <code>outputs/metrics.json</code>,
              })}
            </p>
            <button className="btn btn-sm" onClick={props.onReload}>
              <RefreshCw size={14} /> {t('quality.tab.refresh')}
            </button>
          </Empty>
        </Card>
      )}

      {metricsState === 'ready' && data && main && (
        <div className="q-stack">
          <section className="card q-hero" aria-label={t('quality.tab.heroAria')}>
            <Contrast group={main} size="lg" />
            {rest.length > 0 && (
              <div className="q-hero-side">
                {rest.map((g) => (
                  <Contrast key={g.lead} group={g} size="sm" />
                ))}
              </div>
            )}
          </section>

          <div className="q-grid">
            <Card eyebrow={t('quality.tab.tableEyebrow')} title={t('quality.tab.tableTitle')}>
              <MetricsTable groups={data.groups} holdout={data.holdout} />
            </Card>

            <div className="q-stack">
              <Card eyebrow={t('quality.tab.compareEyebrow')} title={t('quality.tab.compareTitle')}>
                {barsOption && (
                  <EChart
                    option={barsOption}
                    height={260}
                    theme={theme}
                    ariaLabel={t('quality.tab.barsAria')}
                  />
                )}
              </Card>
              <Card
                eyebrow={t('quality.tab.uncEyebrow')}
                title={
                  <span className="q-title-icon">
                    <Target size={16} aria-hidden /> {t('quality.tab.uncTitle')}
                  </span>
                }
              >
                <CoverageBlock
                  coverage={data.coverage}
                  target={data.target}
                  holdout={data.holdout}
                  calibration={data.calibration}
                />
              </Card>
            </div>
          </div>
        </div>
      )}

      <HoldoutCard theme={theme} />
    </div>
  )
}
