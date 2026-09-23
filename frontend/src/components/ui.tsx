// Общие примитивы интерфейса. Стили — в index.css (классы .card, .btn, .badge, .notice, .empty).

import type { ReactNode } from 'react'
import { AlertTriangle, CircleCheck, CircleX, Info, Loader2 } from 'lucide-react'

export function Card(props: { title?: ReactNode; eyebrow?: string; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`card ${props.className ?? ''}`}>
      {(props.title || props.eyebrow || props.actions) && (
        <div className="card-head">
          <div>
            {props.eyebrow && <div className="eyebrow">{props.eyebrow}</div>}
            {props.title && <h2 className="card-title">{props.title}</h2>}
          </div>
          {props.actions}
        </div>
      )}
      {props.children}
    </section>
  )
}

type Tone = 'ok' | 'warn' | 'error' | 'info' | 'neutral' | 'demo' | 'live'

export function Badge(props: { tone?: Tone; icon?: ReactNode; title?: string; children: ReactNode }) {
  return (
    <span className={`badge badge-${props.tone ?? 'neutral'}`} title={props.title}>
      {props.icon}
      {props.children}
    </span>
  )
}

const NOTICE_ICON = {
  ok: <CircleCheck size={16} />,
  warn: <AlertTriangle size={16} />,
  error: <CircleX size={16} />,
  info: <Info size={16} />,
}

export function Notice(props: { tone: 'ok' | 'warn' | 'error' | 'info'; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`notice notice-${props.tone}`} role={props.tone === 'error' ? 'alert' : 'status'}>
      {NOTICE_ICON[props.tone]}
      <div style={{ flex: 1 }}>{props.children}</div>
      {props.action}
    </div>
  )
}

export function Spinner(props: { size?: number; label?: string }) {
  return (
    <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Loader2 size={props.size ?? 16} className="spin" aria-hidden />
      {props.label}
    </span>
  )
}

export function Empty(props: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {props.icon}
      <div style={{ color: 'var(--text)', fontWeight: 600 }}>{props.title}</div>
      {props.children}
    </div>
  )
}

export function Skeleton(props: { height: number; width?: number | string }) {
  return <div className="skeleton" style={{ height: props.height, width: props.width ?? '100%' }} />
}
