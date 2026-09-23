// Вкладка «Качество модели»: проверка на прошлых месяцах (факта за февраль 2026 нет).
// Данные: metrics — /api/metrics (грузит App; v1 и v2 разбирает model.ts), график «прогноз против факта» — /api/holdout
// или, пока его нет, /api/history. Все числа — из API.

import { useMemo } from 'react'
import { ChartColumn, RefreshCw, Target } from 'lucide-react'
import type { QualityTabProps } from '../../app/shared'
import { EChart } from '../../components/EChart'
import { Card, Empty, Notice, Skeleton } from '../../components/ui'
import { maeBarsOption } from './charts'
import { Contrast } from './Contrast'
import { CoverageBlock } from './CoverageBlock'
import { HoldoutCard } from './HoldoutCard'
import { MetricsTable } from './MetricsTable'
import { parseMetrics } from './model'
import './quality.css'

export default function QualityTab(props: QualityTabProps) {
  const { metrics, metricsState, theme } = props
  const data = useMemo(() => (metrics ? parseMetrics(metrics) : null), [metrics])
  const barsOption = useMemo(
    () => (data && data.groups.length > 0 ? maeBarsOption(data.groups, theme) : null),
    [data, theme],
  )
  const [main, ...rest] = data?.groups ?? []
  const rolling = data ? /скользящ/i.test(data.holdout) : false

  return (
    <div className="q">
      <header className="q-head">
        <h1 className="q-title">Качество модели на исторических данных</h1>
        {data && (
          <p className="q-period">
            Период проверки: <b>{data.holdout}</b>
            {rolling && <span className="muted"> — каждый месяц прогнозирует модель, обученная только на данных до его начала</span>}
          </p>
        )}
        <p className="q-intro muted">
          Прогноз строился так же, как в феврале: только архивные прогнозы погоды, доступные на момент выпуска. Факта за
          февраль 2026 нет — поэтому проверка на прошлых месяцах.
        </p>
      </header>

      {metricsState === 'loading' && (
        <div className="q-stack" aria-busy="true" aria-label="Загрузка метрик">
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
              <RefreshCw size={14} /> Повторить
            </button>
          }
        >
          Не удалось загрузить метрики{props.metricsError ? `: ${props.metricsError}` : ''}.
        </Notice>
      )}

      {(metricsState === 'missing' || (metricsState === 'ready' && (!data || data.groups.length === 0))) && (
        <Card>
          <Empty icon={<ChartColumn size={28} aria-hidden />} title="Метрики ещё не посчитаны">
            <p className="q-empty-hint">
              Запустите в каталоге <code>backend</code>: <code>python -m app.forecast.cli metrics</code> — результат
              появится в <code>outputs/metrics.json</code>, затем обновите вкладку.
            </p>
            <button className="btn btn-sm" onClick={props.onReload}>
              <RefreshCw size={14} /> Обновить
            </button>
          </Empty>
        </Card>
      )}

      {metricsState === 'ready' && data && main && (
        <div className="q-stack">
          <section className="card q-hero" aria-label="Главный итог: модель против базовых методов">
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
            <Card eyebrow="Таблица метрик" title="Ошибка по горизонтам и методам">
              <MetricsTable groups={data.groups} holdout={data.holdout} />
            </Card>

            <div className="q-stack">
              <Card eyebrow="Сравнение" title="MAE по методам, D+1 и D+2">
                {barsOption && (
                  <EChart
                    option={barsOption}
                    height={260}
                    theme={theme}
                    ariaLabel="Столбчатая диаграмма: средняя ошибка модели, кривой мощности и персистентности для суток D+1 и D+2"
                  />
                )}
              </Card>
              <Card
                eyebrow="Неуверенность"
                title={
                  <span className="q-title-icon">
                    <Target size={16} aria-hidden /> Интервал неуверенности p10–p90
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
