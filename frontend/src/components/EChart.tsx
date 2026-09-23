// Тонкая обёртка над ECharts (модульный импорт — только нужные части, чтобы не раздувать бандл).
// Цвета графиков брать из cssVar() (lib/theme.ts), а не хардкодить: при смене темы компонент перерисуется (ключ theme).

import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'

echarts.use([
  LineChart, BarChart,
  GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, MarkAreaComponent, CanvasRenderer,
])

export type ChartOption = EChartsCoreOption

export function EChart(props: {
  option: ChartOption
  height: number
  theme: string // 'dark' | 'light' — смена пересоздаёт график с новыми цветами
  onClick?: (params: unknown) => void
  ariaLabel: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)
  const onClick = useRef(props.onClick)
  useEffect(() => {
    onClick.current = props.onClick
  })

  useEffect(() => {
    if (!ref.current) return
    const c = echarts.init(ref.current, undefined, { renderer: 'canvas' })
    chart.current = c
    c.on('click', (p) => onClick.current?.(p))
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(ref.current)
    return () => {
      ro.disconnect()
      c.dispose()
      chart.current = null
    }
  }, [props.theme])

  useEffect(() => {
    chart.current?.setOption(props.option, { notMerge: true })
  }, [props.option, props.theme])

  return <div ref={ref} role="img" aria-label={props.ariaLabel} style={{ width: '100%', height: props.height }} />
}
