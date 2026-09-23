// Главный вывод прогноза одной фразой + «что сделать диспетчеру» (карточки бэкенда). Первое, что видит человек:
// ответ на вопрос «сколько будет и на что обратить внимание». Числа — только из ответа бэкенда (kpiFor, cards).

import { CircleCheck, ClipboardList, Lightbulb } from 'lucide-react'
import type { Forecast } from '../../api/types'
import { Badge } from '../../components/ui'
import { tr, useT } from '../../i18n'
import { hourOf, hoursFull, pct } from '../../lib/format'
import { dayLabel, kpiFor, targetDays, type ObjectId } from './model'
import { confidence, hoursRange, plainCard } from './plain'
import { rich } from './rich'

function compare(a: number | null, b: number | null): string {
  if (a == null || b == null) return ''
  if (b > a * 1.3) return tr('forecast.verdict.stronger')
  if (b < a * 0.7) return tr('forecast.verdict.weaker')
  return tr('forecast.verdict.same')
}

export function Verdict(props: { f: Forecast; object: ObjectId; issueDate: string }) {
  const { t } = useT()
  const { f, object, issueDate } = props
  const [d1, d2] = targetDays(issueDate)
  const k = kpiFor(f, object)
  const who = t(`forecast.verdict.who.${object}`)
  const conf = object === 'station' ? confidence(f.summary.interval_width) : null
  const cards = f.cards ?? []

  return (
    <section className="card fc-verdict" aria-label={t('forecast.verdict.aria')}>
      <div className="fc-verdict-main">
        <div className="eyebrow fc-title-icon">
          <Lightbulb size={14} aria-hidden /> {t('forecast.verdict.title')}
        </div>
        <p className="fc-verdict-text">
          {rich(t('forecast.verdict.main', { who }), {
            day: <b>{dayLabel(d1)}</b>,
            pct: <b className="fc-verdict-num">{pct(k.energyD1 == null ? null : k.energyD1 / 24)}</b>,
            hours: <b>{hoursFull(k.energyD1)}</b>,
          })}
        </p>
        <p className="fc-verdict-sub">
          {t('forecast.verdict.dayAfter', { day: dayLabel(d2), pct: pct(k.energyD2 == null ? null : k.energyD2 / 24) })}
          {compare(k.energyD1, k.energyD2) && <> ({compare(k.energyD1, k.energyD2)})</>}
          {k.peakTime && (
            <>
              {' · '}
              {t('forecast.verdict.peak', { pct: pct(k.peakValue), day: dayLabel(k.peakTime), hour: hourOf(k.peakTime) })}
            </>
          )}
          {k.lowHours != null && (
            <>
              {' · '}
              {t('forecast.verdict.calm', { count: k.lowHours, total: k.hoursTotal })}
            </>
          )}
        </p>
        {conf && (
          <Badge tone={conf.tone} title={t('forecast.verdict.confTitle')}>
            {conf.label}
          </Badge>
        )}
      </div>

      <div className="fc-verdict-todo">
        <div className="eyebrow fc-title-icon">
          <ClipboardList size={14} aria-hidden /> {t('forecast.verdict.todo')}
        </div>
        {cards.length === 0 ? (
          <p className="fc-todo-none">
            <CircleCheck size={16} aria-hidden /> {t('forecast.verdict.noActions')}
          </p>
        ) : (
          <ul className="fc-todo">
            {cards.map((c, i) => {
              const p = plainCard(c)
              return (
                <li key={i} title={t('forecast.verdict.cardTitle', { rule: c.rule, text: c.text })}>
                  <div className="fc-todo-head">
                    <b>{p.title}</b>
                    <span className="mono fc-todo-when">{hoursRange(c.hours)}</span>
                  </div>
                  <div className="fc-todo-text">{p.text}</div>
                  {p.action && <div className="fc-todo-action">→ {p.action}</div>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
