// A. Панель управления: дата выпуска, объект, запуск агента.

import { ChevronLeft, ChevronRight, Play, RefreshCw } from 'lucide-react'
import { Spinner } from '../../components/ui'
import { useT } from '../../i18n'
import { addDays, dateRu } from '../../lib/format'
import { ddmm, OBJECTS, targetDays, type ObjectId } from './model'
import { rich } from './rich'

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
  const { t } = useT()
  const { issueDate, first, last, onDateChange } = props
  const [d1, d2] = targetDays(issueDate)
  const canPrev = issueDate > first
  const canNext = issueDate < last
  const go = (d: string) => {
    if (d >= first && d <= last) onDateChange(d)
  }
  const disabled = props.running || props.busyOther != null

  const hint = props.busyOther
    ? t('forecast.controls.busyOther', { date: dateRu(props.busyOther) })
    : !props.running && !props.modelReady
      ? t('forecast.controls.firstRun')
      : null

  return (
    <section className="card fc-ctrl" aria-label={t('forecast.controls.aria')}>
      <div className="fc-ctrl-row">
        <div className="fc-ctrl-group">
          <label className="eyebrow" htmlFor="fc-issue-date">
            {t('forecast.controls.date')}
          </label>
          <div className="fc-date">
            <button
              type="button"
              className="btn fc-iconbtn"
              onClick={() => go(addDays(issueDate, -1))}
              disabled={!canPrev}
              aria-label={t('forecast.controls.prevDay')}
              title={t('forecast.controls.prevDay')}
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
              aria-label={t('forecast.controls.nextDay')}
              title={t('forecast.controls.nextDay')}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="fc-ctrl-group">
          <span className="eyebrow" id="fc-object-label">
            {t('forecast.controls.object')}
          </span>
          <div
            className="segmented"
            role="group"
            aria-labelledby="fc-object-label"
            title={t('forecast.controls.objectTitle')}
          >
            {OBJECTS.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={props.object === o.id}
                onClick={() => props.onObjectChange(o.id)}
              >
                {t(o.label)}
              </button>
            ))}
          </div>
        </div>

        <div className="fc-ctrl-action">
          <button type="button" className="btn btn-primary fc-run" onClick={props.onRun} disabled={disabled}>
            {props.running ? (
              <Spinner label={t('forecast.controls.running', { sec: props.elapsed })} />
            ) : props.hasForecast ? (
              <>
                <RefreshCw size={16} /> {t('forecast.controls.recalc')}
              </>
            ) : (
              <>
                <Play size={16} /> {t('forecast.controls.run')}
              </>
            )}
          </button>
        </div>
      </div>

      <div className="fc-ctrl-foot">
        <div className="fc-ctrl-caption">
          {rich(t('forecast.controls.caption'), {
            issue: <span className="mono">{dateRu(issueDate)}, 23:59</span>,
            d1: <span className="mono">{ddmm(d1)}</span>,
            d2: <span className="mono">{ddmm(d2)}</span>,
          })}
          <span className="muted">{t('forecast.controls.captionNote')}</span>
        </div>
        {hint && <div className="fc-ctrl-hint">{hint}</div>}
      </div>
    </section>
  )
}
