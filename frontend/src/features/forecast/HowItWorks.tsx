// Полоса «Как это работает» для первого визита: три шага и где что смотреть. Закрывается и больше не мешает.

import { useState } from 'react'
import { X } from 'lucide-react'

const KEY = 'howItWorksHidden'

function initiallyHidden(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

const STEPS = [
  { n: '1', title: 'Выберите дату', text: 'Прогноз делается вечером этого дня на два следующих — как будто будущее ещё неизвестно.' },
  {
    n: '2',
    title: 'Агент считает сам',
    text: 'Берёт прогнозы погоды из 7 моделей, опубликованные до этого момента, отбрасывает неполные, запускает модель и проверяет результат.',
  },
  {
    n: '3',
    title: 'Смотрите результат',
    text: 'Главный вывод и что сделать — сверху, график по часам — ниже, каждый шаг агента — в журнале.',
  },
]

export function HowItWorks() {
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
    <section className="fc-how" aria-label="Как это работает">
      <div className="fc-how-intro">
        <div className="eyebrow">Как это работает</div>
        <p>ИИ-агент прогнозирует выработку ветростанции по часам на двое суток вперёд.</p>
      </div>
      <ol className="fc-how-steps">
        {STEPS.map((s) => (
          <li key={s.n}>
            <span className="fc-how-n mono">{s.n}</span>
            <div>
              <b>{s.title}</b>
              <p>{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-ghost btn-sm fc-how-close" onClick={close} aria-label="Скрыть подсказку">
        <X size={16} />
      </button>
    </section>
  )
}
