// Таблица метрик по горизонтам (строки покрытия сюда не входят — они в блоке интервала).

import { CircleCheck } from 'lucide-react'
import { useT } from '../../i18n'
import { int, pct } from '../../lib/format'
import { KIND_COLOR, type LeadGroup, leadShort, methodLabel } from './model'

export function MetricsTable(props: { groups: LeadGroup[]; holdout: string }) {
  const { t } = useT()
  return (
    <>
      <div className="table-wrap">
        <table className="data q-table">
          <caption className="q-sr-only">{t('quality.table.caption', { period: props.holdout })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('quality.table.lead')}</th>
              <th scope="col">{t('quality.table.method')}</th>
              <th scope="col" className="r">
                {t('quality.table.hours')}
              </th>
              <th scope="col" className="r" title={t('quality.table.maeTitle')}>
                MAE<span className="q-unit">{t('quality.table.unitNom')}</span>
              </th>
              <th scope="col" className="r" title={t('quality.table.rmseTitle')}>
                RMSE<span className="q-unit">{t('quality.table.unitNom')}</span>
              </th>
              <th scope="col" className="r" title={t('quality.table.nmaeTitle')}>
                nMAE<span className="q-unit">%</span>
              </th>
            </tr>
          </thead>
          {props.groups.map((g) => (
            <tbody key={g.lead} className="q-group">
              {g.rows.map((r, i) => {
                const best = r === g.best
                return (
                  <tr key={r.name} className={best ? 'q-best' : undefined}>
                    {i === 0 && (
                      <th scope="rowgroup" rowSpan={g.rows.length} className="q-lead">
                        {leadShort(g.lead)}
                      </th>
                    )}
                    <td>
                      <span className="q-method">
                        <span className="q-swatch" style={{ background: `var(${KIND_COLOR[r.kind]})` }} aria-hidden />
                        <span title={r.name}>{methodLabel(r.name, r.kind)}</span>
                        {best && (
                          <span className="q-best-tag">
                            <CircleCheck size={14} aria-hidden /> {t('quality.table.best')}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="r mono">{int(r.hours)}</td>
                    <td className="r mono">{pct(r.mae, 1)}</td>
                    <td className="r mono">{pct(r.rmse, 1)}</td>
                    <td className="r mono">{pct(r.nmae, 1)}</td>
                  </tr>
                )
              })}
            </tbody>
          ))}
        </table>
      </div>

      <dl className="q-defs">
        <div>
          <dt>MAE</dt>
          <dd>{t('quality.table.defs.mae')}</dd>
        </div>
        <div>
          <dt>RMSE</dt>
          <dd>{t('quality.table.defs.rmse')}</dd>
        </div>
        <div>
          <dt>nMAE</dt>
          <dd>{t('quality.table.defs.nmae')}</dd>
        </div>
        <div>
          <dt>{t('quality.table.hours')}</dt>
          <dd>{t('quality.table.defs.hours')}</dd>
        </div>
        <div>
          <dt>{t('quality.table.defs.curveTerm')}</dt>
          <dd>{t('quality.table.defs.curve')}</dd>
        </div>
        <div>
          <dt>{t('quality.table.defs.persistTerm')}</dt>
          <dd>{t('quality.table.defs.persist')}</dd>
        </div>
      </dl>
    </>
  )
}
