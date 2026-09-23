// Вкладка «О проекте» — презентация продукта: зачем, как работает, что делает ИИ, как устроена модель, честность данных,
// развитие, ограничения, команда и версии. Факты — из README.md, CASE.md и кода; метрики — живые, из /api/metrics.

import {
  ArrowRight,
  Bot,
  CalendarClock,
  CircleAlert,
  Cpu,
  Database,
  ExternalLink,
  Gauge,
  Layers,
  Map as MapIcon,
  Rocket,
  ShieldCheck,
  Users,
  Wind,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { ProjectTabProps } from '../../app/shared'
import type { Metrics } from '../../api/types'
import { pct } from '../../lib/format'
import { useT } from '../../i18n'
import './project.css'

// тексты шагов, плана и ограничений — в словаре project (src/i18n/locales/*/project.ts)
const TOOLS = [
  'rank_weather_sources',
  'fetch_weather',
  'build_features',
  'run_forecast',
  'validate_forecast',
  'analyze_forecast',
  'compare_with_previous',
] as const

const ROADMAP = [
  { id: 'map', icon: <MapIcon size={18} /> },
  { id: 'compare', icon: <Layers size={18} /> },
  { id: 'bid', icon: <CalendarClock size={18} /> },
  { id: 'intraday', icon: <Gauge size={18} /> },
  { id: 'assistant', icon: <Bot size={18} /> },
] as const

const LIMITS = ['noFebruaryActuals', 'shareOfMax', 'gap', 'coverage', 'twoTurbines', 'thresholds'] as const

const TEAM = ['polyakov', 'leonteva', 'golovko'] as const

const STACK = ['python', 'sklearn', 'api', 'llm', 'web', 'data', 'docker'] as const

/** **текст** в строке словаря → жирный. */
function bold(s: string): ReactNode[] {
  return s.split(/\*\*(.+?)\*\*/).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))
}

/** MAE модели, кривой мощности и персистентности на горизонте D+1 из /api/metrics. */
function headline(m: Metrics | null) {
  if (!m) return null
  const d1 = m.rows.filter((r) => (r.lead ?? 'D+1') === 'D+1' && r.mae != null)
  const model = d1.find((r) => /модел/i.test(r.model) && !/без/i.test(r.model))?.mae
  const curve = d1.find((r) => /кривая/i.test(r.model))?.mae
  const persist = d1.find((r) => /персист/i.test(r.model))?.mae
  if (model == null || curve == null) return null
  return { model, curve, persist: persist ?? null, gain: 1 - model / curve }
}

function Section(props: { n: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card pj-section">
      <div className="pj-section-head">
        <span className="pj-n mono">{props.n}</span>
        <span className="pj-ico" aria-hidden>
          {props.icon}
        </span>
        <h2>{props.title}</h2>
      </div>
      {props.children}
    </section>
  )
}

export default function ProjectTab(props: ProjectTabProps) {
  const { t } = useT()
  const h = headline(props.metrics)
  const commit = props.health?.commit

  return (
    <div className="pj">
      <header className="pj-hero">
        <div className="pj-hero-text">
          <div className="eyebrow">{t('project.hero.eyebrow')}</div>
          <h1>
            {t('app.brand.name')}
            <span>{t('project.hero.tagline')}</span>
          </h1>
          <p>{t('project.hero.lead')}</p>
          <div className="pj-hero-actions">
            <button type="button" className="btn btn-primary" onClick={() => props.onOpenTab('forecast')}>
              {t('project.hero.openForecast')} <ArrowRight size={16} />
            </button>
            <button type="button" className="btn" onClick={() => props.onOpenTab('february')}>
              {t('project.hero.allFebruary')}
            </button>
          </div>
        </div>
        <div className="pj-stats">
          <div className="pj-stat">
            <span className="pj-stat-num mono">{h ? pct(h.model, 1) : '—'}</span>
            <span className="pj-stat-cap">{t('project.stats.error')}</span>
          </div>
          <div className="pj-stat">
            <span className="pj-stat-num mono">{h ? `−${pct(h.gain, 0)}` : '—'}</span>
            <span className="pj-stat-cap">{t('project.stats.gain')}</span>
          </div>
          <div className="pj-stat">
            <span className="pj-stat-num mono">7</span>
            <span className="pj-stat-cap">{t('project.stats.steps')}</span>
          </div>
          <div className="pj-stat">
            <span className="pj-stat-num mono">28</span>
            <span className="pj-stat-cap">{t('project.stats.february')}</span>
          </div>
        </div>
      </header>

      <Section n="01" icon={<Wind size={18} />} title={t('project.why.title')}>
        <div className="pj-cols">
          <p>{t('project.why.text')}</p>
          <ul className="pj-list">
            <li>
              {t('project.why.bid')} —{' '}
              <a href="https://adilet.zan.kz/rus/docs/V1500010662" target="_blank" rel="noopener">
                {t('project.why.bidLink')} <ExternalLink size={12} />
              </a>
              .
            </li>
            <li>
              {t('project.why.imbalance')} —{' '}
              <a href="https://zakon.uchet.kz/rus/docs/V1500010532" target="_blank" rel="noopener">
                {t('project.why.imbalanceLink')} <ExternalLink size={12} />
              </a>
              .
            </li>
            <li>
              {t('project.why.fleet')} —{' '}
              <a href="https://ar2024.kegoc.kz/ru/electricity-balance.html" target="_blank" rel="noopener">
                {t('project.why.fleetLink')} <ExternalLink size={12} />
              </a>
              .
            </li>
          </ul>
        </div>
      </Section>

      <Section n="02" icon={<Bot size={18} />} title={t('project.agent.title')}>
        <p className="pj-lead">{bold(t('project.agent.lead'))}</p>
        <ol className="pj-pipeline">
          {TOOLS.map((name, i) => (
            <li key={name}>
              <span className="pj-step mono">{i + 1}</span>
              <div>
                <b>{t(`project.tools.${name}.title`)}</b>
                <code>{name}</code>
                <p>{t(`project.tools.${name}.text`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="small muted">{t('project.agent.passport')}</p>
      </Section>

      <Section n="03" icon={<Cpu size={18} />} title={t('project.model.title')}>
        <div className="pj-grid3">
          <div>
            <h3>
              <Database size={16} /> {t('project.model.dataTitle')}
            </h3>
            <p>{t('project.model.data')}</p>
          </div>
          <div>
            <h3>
              <Wind size={16} /> {t('project.model.weatherTitle')}
            </h3>
            <p>{t('project.model.weather')}</p>
          </div>
          <div>
            <h3>
              <Cpu size={16} /> {t('project.model.modelTitle')}
            </h3>
            <p>{t('project.model.model')}</p>
          </div>
        </div>
        {h && (
          <div className="pj-compare">
            <div className="eyebrow">
              {t('project.model.check')} · {props.metrics?.holdout}
            </div>
            <div className="pj-bars">
              <Bar label={t('project.model.ours')} value={h.model} max={h.persist ?? h.curve} tone="primary" />
              <Bar label={t('project.model.curve')} value={h.curve} max={h.persist ?? h.curve} tone="curve" />
              {h.persist != null && <Bar label={t('project.model.persistence')} value={h.persist} max={h.persist} tone="muted" />}
            </div>
            <p className="small muted">{t('project.model.note')}</p>
          </div>
        )}
      </Section>

      <Section n="04" icon={<ShieldCheck size={18} />} title={t('project.honesty.title')}>
        <ul className="pj-list">
          <li>{t('project.honesty.asOf')}</li>
          <li>{t('project.honesty.noActualWeather')}</li>
          <li>{t('project.honesty.test')}</li>
          <li>{t('project.honesty.noFebruaryActuals')}</li>
          <li>{t('project.honesty.modeLabel')}</li>
        </ul>
      </Section>

      <Section n="05" icon={<Rocket size={18} />} title={t('project.roadmap.title')}>
        <p className="pj-lead">{t('project.roadmap.lead')}</p>
        <div className="pj-roadmap">
          {ROADMAP.map((r) => (
            <div key={r.id} className="pj-road">
              <span className="pj-ico" aria-hidden>
                {r.icon}
              </span>
              <b>{t(`project.roadmap.${r.id}.title`)}</b>
              <p>{t(`project.roadmap.${r.id}.text`)}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section n="06" icon={<CircleAlert size={18} />} title={t('project.limits.title')}>
        <ul className="pj-list">
          {LIMITS.map((l) => (
            <li key={l}>{t(`project.limits.${l}`)}</li>
          ))}
        </ul>
      </Section>

      <Section n="07" icon={<Users size={18} />} title={t('project.team.title')}>
        <div className="pj-cols">
          <div>
            <h3>KU group</h3>
            <ul className="pj-team">
              {TEAM.map((m) => (
                <li key={m}>
                  <b>{t(`project.team.${m}.name`)}</b>
                  <span>{t(`project.team.${m}.role`)}</span>
                </li>
              ))}
            </ul>
            <p className="small muted">{t('project.team.aiNote')}</p>
          </div>
          <div>
            <h3>{t('project.team.version')}</h3>
            <dl className="pj-dl">
              <dt>{t('project.team.build')}</dt>
              <dd className="mono">{commit ?? '—'}</dd>
              <dt>{t('project.team.agentMode')}</dt>
              <dd>{props.meta.mode === 'live' ? `LIVE · ${props.meta.llm_model ?? 'LLM'}` : t('project.team.demo')}</dd>
              <dt>{t('project.team.period')}</dt>
              <dd>
                {props.meta.issue_range.first} … {props.meta.issue_range.last}
              </dd>
              <dt>{t('project.team.history')}</dt>
              <dd>
                {props.meta.history_range.first.slice(0, 10)} … {props.meta.history_range.last.slice(0, 10)}
              </dd>
            </dl>
            <h3>{t('project.team.stackTitle')}</h3>
            <ul className="pj-stack">
              {STACK.map((s) => (
                <li key={s}>{t(`project.team.stack.${s}`)}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </div>
  )
}

function Bar(props: { label: string; value: number; max: number; tone: 'primary' | 'curve' | 'muted' }) {
  const w = props.max > 0 ? Math.min(100, (props.value / props.max) * 100) : 0
  return (
    <div className={`pj-bar pj-bar-${props.tone}`}>
      <span className="pj-bar-label">{props.label}</span>
      <span className="pj-bar-track">
        <span style={{ width: `${w}%` }} />
      </span>
      <span className="pj-bar-val mono">{pct(props.value, 1)}</span>
    </div>
  )
}
