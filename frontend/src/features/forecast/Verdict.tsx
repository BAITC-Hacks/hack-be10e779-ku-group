// Главный вывод прогноза одной фразой + «что сделать диспетчеру» (карточки бэкенда). Первое, что видит человек:
// ответ на вопрос «сколько будет и на что обратить внимание». Числа — только из ответа бэкенда (kpiFor, cards).

import { CircleCheck, ClipboardList, Lightbulb } from 'lucide-react'
import type { Forecast } from '../../api/types'
import { Badge } from '../../components/ui'
import { hourOf, hoursFull, pct } from '../../lib/format'
import { dayLabel, kpiFor, objectLabel, targetDays, type ObjectId } from './model'
import { confidence, hoursRange, plainCard } from './plain'

function compare(a: number | null, b: number | null): string {
  if (a == null || b == null) return ''
  if (b > a * 1.3) return 'ветер усилится'
  if (b < a * 0.7) return 'ветер ослабнет'
  return 'примерно так же'
}

export function Verdict(props: { f: Forecast; object: ObjectId; issueDate: string }) {
  const { f, object, issueDate } = props
  const [d1, d2] = targetDays(issueDate)
  const k = kpiFor(f, object)
  const who = object === 'station' ? 'станция' : objectLabel(object).toLowerCase()
  const conf = object === 'station' ? confidence(f.summary.interval_width) : null
  const cards = f.cards ?? []

  return (
    <section className="card fc-verdict" aria-label="Главный вывод">
      <div className="fc-verdict-main">
        <div className="eyebrow fc-title-icon">
          <Lightbulb size={14} aria-hidden /> Главное
        </div>
        <p className="fc-verdict-text">
          Завтра, <b>{dayLabel(d1)}</b>, {who} выработает в среднем{' '}
          <b className="fc-verdict-num">{pct(k.energyD1 == null ? null : k.energyD1 / 24)}</b> от максимальной мощности — это как{' '}
          <b>{hoursFull(k.energyD1)}</b> работы на полную.
        </p>
        <p className="fc-verdict-sub">
          Послезавтра, {dayLabel(d2)}: {pct(k.energyD2 == null ? null : k.energyD2 / 24)}
          {compare(k.energyD1, k.energyD2) && <> ({compare(k.energyD1, k.energyD2)})</>}
          {k.peakTime && (
            <>
              {' · '}пик {pct(k.peakValue)} — {dayLabel(k.peakTime)} в {hourOf(k.peakTime)}
            </>
          )}
          {k.lowHours != null && (
            <>
              {' · '}почти без ветра {k.lowHours} ч из {k.hoursTotal}
            </>
          )}
        </p>
        {conf && (
          <Badge tone={conf.tone} title="По средней ширине вероятного диапазона на графике (порог — как у проверок агента)">
            {conf.label}
          </Badge>
        )}
      </div>

      <div className="fc-verdict-todo">
        <div className="eyebrow fc-title-icon">
          <ClipboardList size={14} aria-hidden /> Что сделать диспетчеру
        </div>
        {cards.length === 0 ? (
          <p className="fc-todo-none">
            <CircleCheck size={16} aria-hidden /> Особых действий не требуется.
          </p>
        ) : (
          <ul className="fc-todo">
            {cards.map((c, i) => {
              const p = plainCard(c)
              return (
                <li key={i} title={`Правило: ${c.rule}\nИсходно: ${c.text}`}>
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
