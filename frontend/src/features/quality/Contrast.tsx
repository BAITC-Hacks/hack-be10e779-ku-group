// Главный контраст: «на X % точнее кривой мощности» + полосы MAE трёх методов. Всё считается из строк /api/metrics.

import { useT } from '../../i18n'
import { pct } from '../../lib/format'
import { gain, KIND_COLOR, leadHuman, methodLabel, rich, type LeadGroup } from './model'

export function Contrast(props: { group: LeadGroup; size: 'lg' | 'sm' }) {
  const g = props.group
  const vsCurve = gain(g.model, g.curve)
  const vsPersist = gain(g.model, g.persist)
  const max = Math.max(...g.rows.map((r) => r.mae), 0)
  const headId = `q-contrast-${props.size}-${g.lead.replace(/\W/g, '')}`
  const { t } = useT()
  // «на {num} точнее …»: часть до числа — q-stat-pre, после — q-stat-cap (в kk и en порядок слов другой)
  const [statPre = '', statCap = ''] =
    vsCurve != null ? t(vsCurve >= 0 ? 'quality.contrast.better' : 'quality.contrast.worse').split('{num}') : []

  return (
    <div className={`q-contrast q-contrast-${props.size}`} aria-labelledby={headId} role="group">
      <div className="q-contrast-stat">
        <div className="eyebrow" id={headId}>
          {t('quality.contrast.eyebrow', { lead: leadHuman(g.lead) })}
        </div>
        {vsCurve != null ? (
          <p className={`q-stat ${vsCurve < 0 ? 'is-worse' : ''}`}>
            {statPre.trim() && (
              <>
                <span className="q-stat-pre">{statPre.trim()}</span>{' '}
              </>
            )}
            <span className="q-stat-num">{pct(Math.abs(vsCurve))}</span>
            {statCap.trim() && (
              <>
                {' '}
                <span className="q-stat-cap">{statCap.trim()}</span>
              </>
            )}
          </p>
        ) : (
          <p className="muted small">{t('quality.contrast.noPair')}</p>
        )}
        {vsPersist != null && (
          <p className="q-stat-sub">
            {rich(t(vsPersist >= 0 ? 'quality.contrast.persistBetter' : 'quality.contrast.persistWorse'), {
              value: <b className="mono">{pct(Math.abs(vsPersist))}</b>,
            })}
          </p>
        )}
      </div>

      <ul className="q-bars" aria-label={t('quality.contrast.barsAria', { lead: leadHuman(g.lead).toLowerCase() })}>
        {g.rows.map((r) => (
          <li key={r.name} className={`q-bar q-bar-${r.kind}`}>
            <span className="q-bar-label" title={r.name}>
              {methodLabel(r.name, r.kind)}
            </span>
            <span className="q-bar-track" aria-hidden>
              <span
                className="q-bar-fill"
                style={{ width: `${max > 0 ? (r.mae / max) * 100 : 0}%`, background: `var(${KIND_COLOR[r.kind]})` }}
              />
            </span>
            <span className="q-bar-val mono">{pct(r.mae, 1)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
