// A. Панель управления: дата выпуска, объект, запуск агента.

import { ChevronLeft, ChevronRight, Play, RefreshCw } from 'lucide-react'
import { Spinner } from '../../components/ui'
import { addDays, dateRu } from '../../lib/format'
import { ddmm, OBJECTS, targetDays, type ObjectId } from './model'

export function ControlPanel(props: {
  issueDate: string
  first: string
  last: string
  onDateChange: (d: string) => void
  object: ObjectId
  onObjectChange: (o: ObjectId) => void
  hasForecast: boolean
  running: boolean // идёт прогноз на эту дату
  busyOther: string | null // идёт прогноз на другую дату — кнопка заблокирована
  elapsed: number
  modelReady: boolean
  onRun: () => void
}) {
  const { issueDate, first, last, onDateChange } = props
  const [d1, d2] = targetDays(issueDate)
  const canPrev = issueDate > first
  const canNext = issueDate < last
  const go = (d: string) => {
    if (d >= first && d <= last) onDateChange(d)
  }
  const disabled = props.running || props.busyOther != null

  const hint = props.busyOther
    ? `Идёт прогноз на выпуск ${dateRu(props.busyOther)} — дождитесь окончания`
    : !props.running && !props.modelReady
      ? 'Первый прогноз займёт около минуты: модель обучается'
      : null

  return (
    <section className="card fc-ctrl" aria-label="Панель управления прогнозом">
      <div className="fc-ctrl-row">
        <div className="fc-ctrl-group">
          <label className="eyebrow" htmlFor="fc-issue-date">
            Дата прогноза
          </label>
          <div className="fc-date">
            <button
              type="button"
              className="btn fc-iconbtn"
              onClick={() => go(addDays(issueDate, -1))}
              disabled={!canPrev}
              aria-label="Предыдущий день"
              title="Предыдущий день"
            >
              <ChevronLeft size={16} />
            </button>
            <input
              id="fc-issue-date"
              className="fc-date-input mono"
              type="date"
              value={issueDate}
              min={first}
              max={last}
              onChange={(e) => {
                if (e.target.value) go(e.target.value)
              }}
            />
            <button
              type="button"
              className="btn fc-iconbtn"
              onClick={() => go(addDays(issueDate, 1))}
              disabled={!canNext}
              aria-label="Следующий день"
              title="Следующий день"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="fc-ctrl-group">
          <span className="eyebrow" id="fc-object-label">
            Объект
          </span>
          <div
            className="segmented"
            role="group"
            aria-labelledby="fc-object-label"
            title="Станция = среднее двух турбин, в % от максимальной мощности"
          >
            {OBJECTS.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={props.object === o.id}
                onClick={() => props.onObjectChange(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="fc-ctrl-action">
          <button type="button" className="btn btn-primary fc-run" onClick={props.onRun} disabled={disabled}>
            {props.running ? (
              <Spinner label={`Идёт прогноз… ${props.elapsed} с`} />
            ) : props.hasForecast ? (
              <>
                <RefreshCw size={16} /> Пересчитать
              </>
            ) : (
              <>
                <Play size={16} /> Сделать прогноз
              </>
            )}
          </button>
        </div>
      </div>

      <div className="fc-ctrl-foot">
        <div className="fc-ctrl-caption">
          Прогноз делается вечером <span className="mono">{dateRu(issueDate)}, 23:59</span> на{' '}
          <span className="mono">{ddmm(d1)}</span> и <span className="mono">{ddmm(d2)}</span>
          <span className="muted"> — как будто будущее ещё неизвестно: берётся только погода, опубликованная до этого момента</span>
        </div>
        {hint && <div className="fc-ctrl-hint">{hint}</div>}
      </div>
    </section>
  )
}
