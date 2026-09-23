// Главный контраст: «на X % точнее кривой мощности» + полосы MAE трёх методов. Всё считается из строк /api/metrics.

import { pct } from '../../lib/format'
import { gain, KIND_COLOR, leadHuman, methodLabel, type LeadGroup } from './model'

export function Contrast(props: { group: LeadGroup; size: 'lg' | 'sm' }) {
  const g = props.group
  const vsCurve = gain(g.model, g.curve)
  const vsPersist = gain(g.model, g.persist)
  const max = Math.max(...g.rows.map((r) => r.mae), 0)
  const headId = `q-contrast-${props.size}-${g.lead.replace(/\W/g, '')}`

  return (
    <div className={`q-contrast q-contrast-${props.size}`} aria-labelledby={headId} role="group">
      <div className="q-contrast-stat">
        <div className="eyebrow" id={headId}>
          {leadHuman(g.lead)} · средняя ошибка, % от максимальной мощности
        </div>
        {vsCurve != null ? (
          <p className={`q-stat ${vsCurve < 0 ? 'is-worse' : ''}`}>
            <span className="q-stat-pre">на</span> <span className="q-stat-num">{pct(Math.abs(vsCurve))}</span>{' '}
            <span className="q-stat-cap">{vsCurve >= 0 ? 'точнее' : 'хуже'} простого расчёта по ветру</span>
          </p>
        ) : (
          <p className="muted small">В метриках нет пары «модель — простой расчёт по ветру» для этого горизонта.</p>
        )}
        {vsPersist != null && (
          <p className="q-stat-sub">
            и на <b className="mono">{pct(Math.abs(vsPersist))}</b> {vsPersist >= 0 ? 'точнее' : 'хуже'} наивного прогноза «завтра как сегодня»
          </p>
        )}
      </div>

      <ul className="q-bars" aria-label={`Средняя ошибка по методам, ${leadHuman(g.lead).toLowerCase()}, % от максимальной мощности`}>
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
