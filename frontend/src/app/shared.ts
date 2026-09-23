// Общие пропсы вкладок. Каждая вкладка живёт в своей папке src/features/<вкладка>/ и получает всё нужное отсюда.

import type { Health, Meta, Metrics } from '../api/types'

export type Theme = 'dark' | 'light'

export type ForecastTabProps = {
  meta: Meta
  theme: Theme
  issueDate: string // выбранная дата выпуска YYYY-MM-DD (прогноз делается в конце этого дня)
  onIssueDateChange: (d: string) => void
}

export type FebruaryTabProps = {
  meta: Meta
  theme: Theme
  onOpenDate: (d: string) => void // открыть вкладку «Прогноз» на этой дате
}

export type QualityTabProps = {
  theme: Theme
  metrics: Metrics | null // null — метрик нет (404) или ещё грузятся (см. metricsState)
  metricsState: 'loading' | 'ready' | 'missing' | 'error'
  metricsError: string | null
  onReload: () => void
}

export type AboutModalProps = {
  open: boolean
  onClose: () => void
  meta: Meta
  health: Health | null
}
