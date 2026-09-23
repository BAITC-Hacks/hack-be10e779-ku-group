// Подстановка разметки в переведённую фразу: rich(t('…'), { date: <span className="mono">…</span> }).
// t() оставляет незаполненные {name} как есть — здесь они заменяются React-узлами, порядок слов задаёт перевод.

import { Fragment, type ReactNode } from 'react'

export function rich(text: string, nodes: Record<string, ReactNode>): ReactNode {
  const parts = text.split(/\{(\w+)\}/g)
  return parts.map((p, i) =>
    i % 2 === 1 ? <Fragment key={i}>{p in nodes ? nodes[p] : `{${p}}`}</Fragment> : <Fragment key={i}>{p}</Fragment>,
  )
}
