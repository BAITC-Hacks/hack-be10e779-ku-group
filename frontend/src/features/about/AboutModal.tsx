// Окно «О системе»: коротко и только то, что есть в CASE.md, docs/api-contract.md и docs/memory/backend.md.
// Доступный диалог: role=dialog + aria-modal, Esc и клик по фону закрывают, фокус на «Закрыть» при открытии,
// Tab не уходит за пределы окна, после закрытия фокус возвращается туда, где был.

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ChartLine,
  CloudDownload,
  Cpu,
  CornerDownLeft,
  ExternalLink,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import type { AboutModalProps } from '../../app/shared'
import { Badge } from '../../components/ui'
import { dateRu, num } from '../../lib/format'
import { STAGES, type Stage } from '../../lib/steps'
import { useT } from '../../i18n'
import './about.css'

// названия и описания этапов — в словаре about.stages (src/i18n/locales/*/about.ts)
const STAGE_INFO: Record<Stage, { icon: ReactNode; key: 'weather' | 'prep' | 'model' | 'forecast' | 'analysis' | 'recalc' }> = {
  Погода: { icon: <CloudDownload size={16} />, key: 'weather' },
  Подготовка: { icon: <SlidersHorizontal size={16} />, key: 'prep' },
  Модель: { icon: <Cpu size={16} />, key: 'model' },
  Прогноз: { icon: <ChartLine size={16} />, key: 'forecast' },
  Анализ: { icon: <Search size={16} />, key: 'analysis' },
  Пересчёт: { icon: <RefreshCw size={16} />, key: 'recalc' },
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

function coord(v: number, pos: string, neg: string) {
  return `${num(Math.abs(v), 6)}° ${v >= 0 ? pos : neg}`
}

export default function AboutModal(props: AboutModalProps) {
  const { open, meta, health } = props
  const { t } = useT()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onClose = useRef(props.onClose)
  useEffect(() => {
    onClose.current = props.onClose
  })

  useEffect(() => {
    if (!open) return
    const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose.current()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const inside = dialogRef.current.contains(document.activeElement)
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      prevFocus?.focus()
    }
  }, [open])

  if (!open) return null

  const mode = meta.mode ?? health?.mode ?? 'demo' // как бейдж в шапке (App.tsx)
  const turbines = [...meta.turbines].sort((a, b) => a.id.localeCompare(b.id))

  return createPortal(
    <div
      className="ab-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose()
      }}
    >
      <div className="ab-dialog" role="dialog" aria-modal="true" aria-labelledby="ab-title" aria-describedby="ab-lead" ref={dialogRef}>
        <header className="ab-head">
          <div>
            <div className="eyebrow">{t('app.brand.name')}</div>
            <h2 id="ab-title" className="ab-title">
              {t('about.title')}
            </h2>
          </div>
          <button ref={closeRef} className="btn btn-ghost btn-sm ab-close" onClick={props.onClose} aria-label={t('about.closeAria')}>
            <X size={18} />
          </button>
        </header>

        <div className="ab-body" tabIndex={0} aria-label={t('about.bodyAria')}>
          <section className="ab-section">
            <h3>{t('about.what.title')}</h3>
            <p id="ab-lead">
              {t('about.what.lead', {
                station: meta.station.name,
                from: dateRu(meta.issue_range.first),
                to: dateRu(meta.issue_range.last),
              })}
            </p>
          </section>

          <section className="ab-section">
            <h3>{t('about.cycle.title')}</h3>
            <ol className="ab-cycle">
              {STAGES.map((s, i) => (
                <li key={s} className="ab-stage">
                  <span className="ab-stage-icon" aria-hidden>
                    {STAGE_INFO[s].icon}
                  </span>
                  <span className="ab-stage-name">
                    <span className="ab-stage-n mono">{i + 1}</span> {t(`about.stages.${STAGE_INFO[s].key}.name`)}
                  </span>
                  <span className="ab-stage-text">{t(`about.stages.${STAGE_INFO[s].key}.text`)}</span>
                </li>
              ))}
            </ol>
            <p className="ab-loop">
              <CornerDownLeft size={16} aria-hidden />
              <span>{t('about.cycle.loop')}</span>
            </p>
            <div className="ab-modes">
              <div className="ab-mode">
                <Badge tone="live">LIVE</Badge>
                <p>
                  {t('about.cycle.live')}
                  {meta.llm_model ? (
                    <>
                      {' '}
                      (<span className="mono">{meta.llm_model}</span>)
                    </>
                  ) : null}
                  {t('about.cycle.liveEnd')}
                </p>
              </div>
              <div className="ab-mode">
                <Badge tone="demo">DEMO</Badge>
                <p>{t('about.cycle.demo')}</p>
              </div>
            </div>
            <p className="ab-note">{t('about.cycle.note')}</p>
          </section>

          <section className="ab-section">
            <h3>{t('about.honesty.title')}</h3>
            <ul className="ab-list">
              <li>
                {t('about.honesty.momentBefore')} <span className="mono">23:59</span> {t('about.honesty.momentAfter')}
              </li>
              <li>
                {t('about.honesty.horizonBefore')} <span className="mono">previous_day1/2</span>
                {t('about.honesty.horizonAfter')}
              </li>
              <li>{t('about.honesty.noActualWeather')}</li>
              <li>{t('about.honesty.noFebruaryActuals')}</li>
            </ul>
          </section>

          <section className="ab-section">
            <h3>{t('about.model.title')}</h3>
            <ul className="ab-list">
              <li>{t('about.model.boosting')}</li>
              <li>{t('about.model.features')}</li>
              <li>{t('about.model.calibration')}</li>
              <li>{t('about.model.baselines')}</li>
            </ul>
          </section>

          <section className="ab-section">
            <h3>{t('about.station.title')}</h3>
            <ul className="ab-turbines">
              {turbines.map((tb) => (
                <li key={tb.id}>
                  <MapPin size={14} aria-hidden />
                  <span>{t('about.station.turbine', { n: tb.id.replace(/\D/g, '') || tb.id })}</span>
                  <span className="mono">
                    {coord(tb.lat, t('about.station.north'), t('about.station.south'))},{' '}
                    {coord(tb.lon, t('about.station.east'), t('about.station.west'))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="ab-note">
              {t('about.station.time', { offset: meta.station.utc_offset })} (<span className="mono">{meta.station.tz}</span>).{' '}
              {t('about.station.history', {
                from: dateRu(meta.history_range.first),
                to: dateRu(meta.history_range.last),
              })}
            </p>
          </section>

          <section className="ab-section">
            <h3>{t('about.sources.title')}</h3>
            <ul className="ab-list">
              <li>
                {t('about.sources.weather')} —{' '}
                <a href="https://open-meteo.com/en/docs/previous-runs-api" target="_blank" rel="noreferrer noopener">
                  Open-Meteo Previous Runs API <ExternalLink size={12} aria-hidden />
                </a>
                , {t('about.sources.license')}{' '}
                <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer noopener">
                  CC BY 4.0 <ExternalLink size={12} aria-hidden />
                </a>
                {t('about.sources.offline')}
              </li>
              <li>{t('about.sources.turbines')}</li>
              {meta.weather_sources.length > 0 && (
                <li>
                  {t('about.sources.columns')}{' '}
                  {meta.weather_sources.map((s, i) => (
                    <span key={s}>
                      {i > 0 && ', '}
                      <span className="mono">{s}</span>
                    </span>
                  ))}
                </li>
              )}
            </ul>
          </section>

          <section className="ab-section ab-version">
            <h3>{t('about.version.title')}</h3>
            {health ? (
              <dl className="ab-dl">
                <div>
                  <dt>{t('about.version.build')}</dt>
                  <dd className="mono">{health.commit ?? '—'}</dd>
                </div>
                <div>
                  <dt>{t('about.version.mode')}</dt>
                  <dd>
                    {mode === 'live' ? (
                      <Badge tone="live">LIVE · LLM{meta.llm_model ? `: ${meta.llm_model}` : ''}</Badge>
                    ) : (
                      <Badge tone="demo">{t('about.version.demo')}</Badge>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t('about.version.server')}</dt>
                  <dd className="mono">{health.status}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted">{t('about.version.offline')}</p>
            )}
            <p className="ab-note">KU group · HackAlem AI 2026</p>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}
