// Таблица метрик по горизонтам (строки покрытия сюда не входят — они в блоке интервала).

import { CircleCheck } from 'lucide-react'
import { pct } from '../../lib/format'
import { intRu, KIND_COLOR, type LeadGroup } from './model'

export function MetricsTable(props: { groups: LeadGroup[]; holdout: string }) {
  return (
    <>
      <div className="table-wrap">
        <table className="data q-table">
          <caption className="q-sr-only">Ошибки прогноза по горизонтам и методам, период: {props.holdout}</caption>
          <thead>
            <tr>
              <th scope="col">Горизонт</th>
              <th scope="col">Метод</th>
              <th scope="col" className="r">
                Часов
              </th>
              <th scope="col" className="r" title="Средняя абсолютная ошибка, % номинала">
                MAE<span className="q-unit">% ном.</span>
              </th>
              <th scope="col" className="r" title="Корень из средней квадратичной ошибки, % номинала">
                RMSE<span className="q-unit">% ном.</span>
              </th>
              <th scope="col" className="r" title="MAE, делённая на среднюю фактическую выработку">
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
                      <th scope="rowgroup" rowSpan={g.rows.length} className="q-lead mono">
                        {g.lead}
                      </th>
                    )}
                    <td>
                      <span className="q-method">
                        <span className="q-swatch" style={{ background: `var(${KIND_COLOR[r.kind]})` }} aria-hidden />
                        <span>{r.name}</span>
                        {best && (
                          <span className="q-best-tag">
                            <CircleCheck size={14} aria-hidden /> лучший
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="r mono">{intRu(r.hours)}</td>
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
          <dd>средняя абсолютная ошибка по часам, в % номинальной мощности (мощность в данных нормирована 0–1).</dd>
        </div>
        <div>
          <dt>RMSE</dt>
          <dd>корень из средней квадратичной ошибки, % номинала — сильнее штрафует крупные промахи.</dd>
        </div>
        <div>
          <dt>nMAE</dt>
          <dd>MAE, делённая на среднюю фактическую выработку за период проверки.</dd>
        </div>
        <div>
          <dt>Часов</dt>
          <dd>сколько часов вошло в оценку: есть и архивный прогноз погоды, и факт выработки.</dd>
        </div>
        <div>
          <dt>Кривая мощности</dt>
          <dd>медиана мощности станции по скорости ветра на истории, применённая к прогнозному ветру на 100 м.</dd>
        </div>
        <div>
          <dt>Персистентность</dt>
          <dd>«завтра как сегодня»: повтор фактической выработки последних известных суток.</dd>
        </div>
      </dl>
    </>
  )
}
