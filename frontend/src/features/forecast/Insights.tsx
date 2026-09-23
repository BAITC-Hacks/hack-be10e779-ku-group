// F + G. Объяснение агента и результаты анализа: предупреждения, пересчёт относительно прошлого выпуска.

import { MessageSquareText, ScanSearch } from 'lucide-react'
import type { Forecast } from '../../api/types'
import { Card, Notice } from '../../components/ui'
import { dateRu, num, pct } from '../../lib/format'
import { dayLabel, prettyDates } from './model'

const SIGNIFICANT = 0.05 // как в контракте: mean_abs_change > 0.05 → «прогноз заметно изменился»

export function Explanation(props: { f: Forecast; llmModel: string | null }) {
  const { f } = props
  const llm = f.mode === 'live' && !f.fallback
  const by = llm
    ? `Сформулировано: LLM${props.llmModel ? ` (${props.llmModel})` : ''}`
    : f.mode === 'live'
      ? 'LLM не завершила цикл, досчитал планировщик — текст мог быть сформирован по шаблону'
      : 'Сформулировано по шаблону (DEMO, без LLM)'
  return (
    <Card
      className="fc-explain"
      eyebrow="Объяснение агента"
      title={
        <span className="fc-title-icon">
          <MessageSquareText size={16} aria-hidden /> Что ожидается
        </span>
      }
    >
      {f.explanation ? (
        <p className="fc-explain-text">{prettyDates(f.explanation)}</p>
      ) : (
        <p className="muted">Объяснение не пришло в ответе.</p>
      )}
      <div className="fc-explain-by">{by}</div>
    </Card>
  )
}

export function Analysis(props: { f: Forecast }) {
  const { f } = props
  const flags = f.analysis?.flags ?? []
  const upd = f.analysis?.update
  const changed = f.analysis?.changed_vs_previous

  let update = null
  if (upd) {
    // 6.18 → 6.21 при одном знаке дало бы «6,2 → 6,2» — тогда показываем два знака
    const digits = num(upd.energy_old) === num(upd.energy_new) ? 2 : 1
    update = (
      <Notice tone={upd.significant ? 'warn' : 'info'}>
        Прогноз на {dayLabel(upd.day)} обновлён по свежей погоде: <span className="mono">{num(upd.energy_old, digits)}</span> →{' '}
        <span className="mono">{num(upd.energy_new, digits)}</span> ч на номинале, среднее изменение{' '}
        <span className="mono">{pct(upd.mean_abs_change, 1)}</span>
        <span className="fc-notice-sub">
          Сравнение с выпуском {dateRu(upd.previous_issue)} · максимум за час {pct(upd.max_abs_change, 1)}
        </span>
      </Notice>
    )
  } else if (changed != null) {
    update = (
      <Notice tone={changed > SIGNIFICANT ? 'warn' : 'info'}>
        Относительно прошлого выпуска прогноз на D+1 изменился в среднем на <span className="mono">{pct(changed, 1)}</span>{' '}
        номинала
      </Notice>
    )
  }

  return (
    <Card
      className="fc-analysis"
      eyebrow="Анализ результата"
      title={
        <span className="fc-title-icon">
          <ScanSearch size={16} aria-hidden /> Предупреждения и пересчёт
        </span>
      }
    >
      <div className="fc-notices">
        {flags.length === 0 ? (
          <Notice tone="ok">Замечаний нет</Notice>
        ) : (
          flags.map((fl, i) => (
            <Notice key={i} tone="warn">
              {prettyDates(fl)}
            </Notice>
          ))
        )}
        {update && <div className="eyebrow fc-notices-sep">Пересчёт при обновлении погоды</div>}
        {update}
      </div>
    </Card>
  )
}
