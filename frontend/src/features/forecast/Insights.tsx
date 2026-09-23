// F + G. Объяснение агента и результаты анализа: предупреждения, пересчёт относительно прошлого выпуска.

import { MessageSquareText, ScanSearch } from 'lucide-react'
import type { Forecast } from '../../api/types'
import { Card, Notice } from '../../components/ui'
import { useT } from '../../i18n'
import { dateRu, num, pct } from '../../lib/format'
import { dayLabel, prettyDates } from './model'
import { plainFlag } from './plain'
import { rich } from './rich'

const SIGNIFICANT = 0.05 // как в контракте: mean_abs_change > 0.05 → «прогноз заметно изменился»

export function Explanation(props: { f: Forecast; llmModel: string | null }) {
  const { t, locale } = useT()
  const { f } = props
  const llm = f.mode === 'live' && !f.fallback
  const by = llm
    ? t('forecast.explain.byLlm', { model: props.llmModel ? ` (${props.llmModel})` : '' })
    : f.mode === 'live'
      ? t('forecast.explain.fallback')
      : t('forecast.explain.template')
  return (
    <Card
      className="fc-explain"
      eyebrow={t('forecast.explain.eyebrow')}
      title={
        <span className="fc-title-icon">
          <MessageSquareText size={16} aria-hidden /> {t('forecast.explain.title')}
        </span>
      }
    >
      {f.explanation ? (
        <p className="fc-explain-text">{prettyDates(f.explanation)}</p>
      ) : (
        <p className="muted">{t('forecast.explain.missing')}</p>
      )}
      {f.explanation && locale !== 'ru' && <div className="fc-explain-by muted">{t('forecast.explain.ruNote')}</div>}
      <div className="fc-explain-by">{by}</div>
    </Card>
  )
}

export function Analysis(props: { f: Forecast }) {
  const { t } = useT()
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
        {rich(
          t('forecast.analysis.update', {
            day: dayLabel(upd.day),
            dir: upd.energy_new >= upd.energy_old ? t('forecast.analysis.more') : t('forecast.analysis.less'),
          }),
          {
            old: <span className="mono">{num(upd.energy_old, digits)}</span>,
            new: <span className="mono">{num(upd.energy_new, digits)}</span>,
            mean: <span className="mono">{pct(upd.mean_abs_change, 1)}</span>,
          },
        )}
        <span className="fc-notice-sub">
          {t('forecast.analysis.updateSub', { date: dateRu(upd.previous_issue), max: pct(upd.max_abs_change, 1) })}
        </span>
      </Notice>
    )
  } else if (changed != null) {
    update = (
      <Notice tone={changed > SIGNIFICANT ? 'warn' : 'info'}>
        {rich(t('forecast.analysis.changed'), { value: <span className="mono">{pct(changed, 1)}</span> })}
      </Notice>
    )
  }

  return (
    <Card
      className="fc-analysis"
      eyebrow={t('forecast.analysis.eyebrow')}
      title={
        <span className="fc-title-icon">
          <ScanSearch size={16} aria-hidden /> {t('forecast.analysis.title')}
        </span>
      }
    >
      <div className="fc-notices">
        {flags.length === 0 ? (
          <Notice tone="ok">{t('forecast.analysis.noFlags')}</Notice>
        ) : (
          flags.map((fl, i) => (
            <div key={i} title={fl}>
              <Notice tone="warn">{plainFlag(fl)}</Notice>
            </div>
          ))
        )}
        {update && <div className="eyebrow fc-notices-sep">{t('forecast.analysis.updateSep')}</div>}
        {update}
      </div>
    </Card>
  )
}
