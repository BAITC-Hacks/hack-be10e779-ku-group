// Полоса «Как это работает» для первого визита: три шага и где что смотреть. Закрывается и больше не мешает.

import { useState } from 'react'
import { X } from 'lucide-react'
import { useT, type TKey } from '../../i18n'

const KEY = 'howItWorksHidden'

function initiallyHidden(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

// title/text — ключи словаря forecast.how.*
const STEPS: { n: string; title: TKey; text: TKey }[] = [
  { n: '1', title: 'forecast.how.s1Title', text: 'forecast.how.s1Text' },
  { n: '2', title: 'forecast.how.s2Title', text: 'forecast.how.s2Text' },
  { n: '3', title: 'forecast.how.s3Title', text: 'forecast.how.s3Text' },
]

export function HowItWorks() {
  const { t } = useT()
  const [hidden, setHidden] = useState(initiallyHidden)
  if (hidden) return null
  const close = () => {
    setHidden(true)
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* не критично */
    }
  }
  return (
    <section className="fc-how" aria-label={t('forecast.how.aria')}>
      <div className="fc-how-intro">
        <div className="eyebrow">{t('forecast.how.title')}</div>
        <p>{t('forecast.how.intro')}</p>
      </div>
      <ol className="fc-how-steps">
        {STEPS.map((s) => (
          <li key={s.n}>
            <span className="fc-how-n mono">{s.n}</span>
            <div>
              <b>{t(s.title)}</b>
              <p>{t(s.text)}</p>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-ghost btn-sm fc-how-close" onClick={close} aria-label={t('forecast.how.close')}>
        <X size={16} />
      </button>
    </section>
  )
}
