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
import './about.css'

const STAGE_INFO: Record<Stage, { icon: ReactNode; text: string }> = {
  Погода: {
    icon: <CloudDownload size={16} />,
    text: 'архивный прогноз Open-Meteo, выпущенный до момента прогноза; источники с пропусками данных исключаются',
  },
  Подготовка: {
    icon: <SlidersHorizontal size={16} />,
    text: 'почасовые признаки: ветер 10 и 100 м, порывы, направление, температура, календарь, ансамбль моделей погоды',
  },
  Модель: { icon: <Cpu size={16} />, text: 'квантильный бустинг: p10 / p50 / p90 по станции и прогноз по каждой турбине' },
  Прогноз: { icon: <ChartLine size={16} />, text: '48 почасовых значений — сутки D+1 и D+2 — с интервалом p10–p90' },
  Анализ: { icon: <Search size={16} />, text: 'проверки правдоподобия, неуверенности и расхождения источников погоды, объяснение' },
  Пересчёт: {
    icon: <RefreshCw size={16} />,
    text: 'сутки D+1 сравниваются с прогнозом тех же часов из прошлого выпуска (по более старой погоде)',
  },
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

function coord(v: number, pos: string, neg: string) {
  return `${num(Math.abs(v), 6)}° ${v >= 0 ? pos : neg}`
}

export default function AboutModal(props: AboutModalProps) {
  const { open, meta, health } = props
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
            <div className="eyebrow">Ветер·Прогноз</div>
            <h2 id="ab-title" className="ab-title">
              О системе
            </h2>
          </div>
          <button ref={closeRef} className="btn btn-ghost btn-sm ab-close" onClick={props.onClose} aria-label="Закрыть окно «О системе»">
            <X size={18} />
          </button>
        </header>

        <div className="ab-body" tabIndex={0} aria-label="Описание системы">
          <section className="ab-section">
            <h3>Что делает</h3>
            <p id="ab-lead">
              Строит почасовой прогноз выработки ветроэлектростанции из двух турбин ({meta.station.name}) на 48 часов —
              сутки D+1 и D+2 — с интервалом неуверенности p10–p90, по станции и по каждой турбине. Прогнозы воспроизводятся
              так, как если бы делались в прошлом: выпуски с {dateRu(meta.issue_range.first)} по{' '}
              {dateRu(meta.issue_range.last)} покрывают весь февраль 2026. Мощность — в % номинала: установленной мощности
              в МВт в данных нет.
            </p>
          </section>

          <section className="ab-section">
            <h3>Агентный цикл</h3>
            <ol className="ab-cycle">
              {STAGES.map((s, i) => (
                <li key={s} className="ab-stage">
                  <span className="ab-stage-icon" aria-hidden>
                    {STAGE_INFO[s].icon}
                  </span>
                  <span className="ab-stage-name">
                    <span className="ab-stage-n mono">{i + 1}</span> {s}
                  </span>
                  <span className="ab-stage-text">{STAGE_INFO[s].text}</span>
                </li>
              ))}
            </ol>
            <p className="ab-loop">
              <CornerDownLeft size={16} aria-hidden />
              <span>
                Пересчёт → Погода: при свежем выпуске погоды или исключённом источнике прогноз считается заново.
              </span>
            </p>
            <div className="ab-modes">
              <div className="ab-mode">
                <Badge tone="live">LIVE</Badge>
                <p>
                  Порядок шагов и исключение источников погоды выбирает LLM через вызовы инструментов
                  {meta.llm_model ? (
                    <>
                      {' '}
                      (<span className="mono">{meta.llm_model}</span>)
                    </>
                  ) : null}
                  . Если LLM не завершила цикл — досчитывает планировщик, и это видно в журнале.
                </p>
              </div>
              <div className="ab-mode">
                <Badge tone="demo">DEMO</Badge>
                <p>Без ключа тот же цикл выполняет детерминированный планировщик — погода, модель и расчёты настоящие.</p>
              </div>
            </div>
            <p className="ab-note">Числа в обоих режимах считает код: LLM не придумывает значения прогноза.</p>
          </section>

          <section className="ab-section">
            <h3>Честность данных</h3>
            <ul className="ab-list">
              <li>
                Момент прогноза — конец дня D, <span className="mono">23:59</span> (время станции).
              </li>
              <li>
                Сутки D+1 — из прогноза погоды, выпущенного примерно за 24 ч до часа, D+2 — примерно за 48 ч (архив
                Open-Meteo <span className="mono">previous_day1/2</span>). Время выпуска — по определению архива, задержка
                публикации не учтена.
              </li>
              <li>Фактическая погода (наблюдения, реанализ) за прогнозируемые сутки не используется.</li>
              <li>
                Факта выработки за февраль 2026 нет — качество проверяется на прошлых месяцах (вкладка «Качество модели»).
              </li>
            </ul>
          </section>

          <section className="ab-section">
            <h3>Модель</h3>
            <ul className="ab-list">
              <li>
                Градиентный бустинг scikit-learn с квантилями p10 / p50 / p90; отдельные модели для турбин 1 и 2.
              </li>
              <li>
                Признаки — ансамбль погодных моделей: ECMWF, ICON, GFS (ветер 100 и 10 м), JMA, CMA, GEM (ветер 10 м),
                их среднее и разброс.
              </li>
              <li>Интервал p10–p90 дополнительно расширяется конформной калибровкой по режимам ветра.</li>
              <li>
                Базовые методы для сравнения: кривая мощности по прогнозному ветру и персистентность («завтра как
                сегодня»).
              </li>
            </ul>
          </section>

          <section className="ab-section">
            <h3>Станция</h3>
            <ul className="ab-turbines">
              {turbines.map((t) => (
                <li key={t.id}>
                  <MapPin size={14} aria-hidden />
                  <span>Турбина {t.id.replace(/\D/g, '') || t.id}</span>
                  <span className="mono">
                    {coord(t.lat, 'с. ш.', 'ю. ш.')}, {coord(t.lon, 'в. д.', 'з. д.')}
                  </span>
                </li>
              ))}
            </ul>
            <p className="ab-note">
              Время везде — местное станции, UTC{meta.station.utc_offset} (<span className="mono">{meta.station.tz}</span>).
              История измерений: {dateRu(meta.history_range.first)} — {dateRu(meta.history_range.last)}, шаг 10 минут,
              усреднение до часа.
            </p>
          </section>

          <section className="ab-section">
            <h3>Источники и лицензии</h3>
            <ul className="ab-list">
              <li>
                Погода —{' '}
                <a href="https://open-meteo.com/en/docs/previous-runs-api" target="_blank" rel="noreferrer noopener">
                  Open-Meteo Previous Runs API <ExternalLink size={12} aria-hidden />
                </a>
                , лицензия{' '}
                <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer noopener">
                  CC BY 4.0 <ExternalLink size={12} aria-hidden />
                </a>
                . Без ключа; ответы сохранены локально, прогноз работает без сети.
              </li>
              <li>Данные турбин — организатор хакатона HackAlem AI 2026.</li>
              {meta.weather_sources.length > 0 && (
                <li>
                  Колонки погоды:{' '}
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
            <h3>Версия</h3>
            {health ? (
              <dl className="ab-dl">
                <div>
                  <dt>Сборка</dt>
                  <dd className="mono">{health.commit ?? '—'}</dd>
                </div>
                <div>
                  <dt>Режим</dt>
                  <dd>
                    {mode === 'live' ? (
                      <Badge tone="live">LIVE · LLM{meta.llm_model ? `: ${meta.llm_model}` : ''}</Badge>
                    ) : (
                      <Badge tone="demo">DEMO · без LLM</Badge>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Сервер</dt>
                  <dd className="mono">{health.status}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted">Нет связи с сервером — версия и режим неизвестны.</p>
            )}
            <p className="ab-note">KU group · HackAlem AI 2026</p>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}
