// Опция ECharts для графика прогноза на 48 ч. Цвета приходят снаружи (cssVar в useMemo с зависимостью от темы).
// Ось X — индекс часа 0…47 (value-ось: точные границы суток и линия «Выпуск»), ось Y — фиксированно 0–100 %.

import type { ChartOption } from '../../components/EChart'
import type { Forecast } from '../../api/types'
import { esc, hourOf, num, pct } from '../../lib/format'
import { cssVar } from '../../lib/theme'
import { dayLabel, ddmm, hasActual, objectLabel, valueOf, type ObjectId } from './model'

export type ChartColors = {
  primary: string
  band: string
  curve: string
  wind: string
  t1: string
  t2: string
  actual: string
  text: string
  text2: string
  text3: string
  border: string
  borderStrong: string
  surface2: string
  surfaceSolid: string
}

/** Цвета графика из CSS-переменных. Аргумент темы — только чтобы вызывающий пересчитывал цвета при её смене. */
export function readChartColors(_theme: string): ChartColors {
  return {
    primary: cssVar('--primary'),
    band: cssVar('--primary-band'),
    curve: cssVar('--curve'),
    wind: cssVar('--wind'),
    t1: cssVar('--t1'),
    t2: cssVar('--t2'),
    actual: cssVar('--actual'),
    text: cssVar('--text'),
    text2: cssVar('--text-2'),
    text3: cssVar('--text-3'),
    border: cssVar('--border'),
    borderStrong: cssVar('--border-strong'),
    surface2: cssVar('--surface-2'),
    surfaceSolid: cssVar('--surface-solid'),
  }
}

export const SERIES = {
  band: 'Вероятный диапазон (80 %)',
  curve: 'Простой расчёт по ветру',
  wind: 'Ветер 100 м (прогноз)',
  actual: 'Факт',
}

export function mainSeriesName(obj: ObjectId): string {
  return obj === 'station' ? 'Прогноз станции' : `${objectLabel(obj)} (прогноз)`
}

type AxisParam = { dataIndex: number }

export function buildChartOption(f: Forecast, obj: ObjectId, c: ChartColors, narrow: boolean): ChartOption {
  const hours = f.hours
  const n = hours.length
  const last = Math.max(0, n - 1)
  const station = obj === 'station'
  const mainColor = obj === 't1' ? c.t1 : obj === 't2' ? c.t2 : c.primary
  const mainName = mainSeriesName(obj)
  const withActual = hasActual(f)

  // граница суток — между последним часом D+1 и первым часом D+2
  const firstD2 = hours.findIndex((h) => h.lead_day === 2)
  const split = firstD2 > 0 ? firstD2 - 0.5 : last / 2
  const d1 = hours.find((h) => h.lead_day === 1)?.time ?? hours[0]?.time ?? f.issue_date
  const d2 = hours.find((h) => h.lead_day === 2)?.time ?? hours[last]?.time ?? f.issue_date

  const winds = hours.map((h) => h.wind_100m).filter((v): v is number => v != null)
  const windMax = Math.max(20, Math.ceil(Math.max(0, ...winds) / 5) * 5)
  const curveName = station ? SERIES.curve : `${SERIES.curve} (станция)`

  const series: Record<string, unknown>[] = []
  if (station) {
    // интервал: прозрачная база p10 + разница p90 − p10 в одном стеке
    series.push(
      {
        name: SERIES.band,
        type: 'line',
        stack: 'band',
        data: hours.map((h, i) => [i, h.p10]),
        symbol: 'none',
        lineStyle: { opacity: 0 },
        silent: true,
        emphasis: { disabled: true },
        z: 1,
      },
      {
        name: SERIES.band,
        type: 'line',
        stack: 'band',
        data: hours.map((h, i) => [i, Math.max(0, h.p90 - h.p10)]),
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { color: c.band, opacity: 1 },
        silent: true,
        emphasis: { disabled: true },
        z: 1,
      },
    )
  }

  series.push({
    name: mainName,
    type: 'line',
    data: hours.map((h, i) => [i, valueOf(h, obj)]),
    showSymbol: false,
    symbol: 'circle',
    symbolSize: 6,
    connectNulls: false,
    lineStyle: { color: mainColor, width: 2 },
    itemStyle: { color: mainColor },
    emphasis: { focus: 'none' },
    z: 5,
    markArea: {
      silent: true,
      label: { color: c.text3, fontSize: 11, position: 'insideTop', distance: 6 },
      data: [
        [
          { name: `Завтра · ${dayLabel(d1)}`, xAxis: 0, itemStyle: { color: 'transparent' } },
          { xAxis: split },
        ],
        [
          { name: `Послезавтра · ${dayLabel(d2)}`, xAxis: split, itemStyle: { color: c.surface2, opacity: 0.85 } },
          { xAxis: last },
        ],
      ],
    },
    markLine: {
      silent: true,
      symbol: ['none', 'none'],
      lineStyle: { color: c.text, width: 1, type: 'solid' },
      label: {
        formatter: `Прогноз сделан ${ddmm(f.issue_date)} 23:59`,
        position: 'end',
        align: 'left',
        color: c.text2,
        fontSize: 11,
      },
      data: [{ xAxis: 0 }],
    },
  })

  series.push({
    name: curveName,
    type: 'line',
    data: hours.map((h, i) => [i, h.curve ?? null]),
    showSymbol: false,
    lineStyle: { color: c.curve, width: 1.5, type: 'dashed' },
    itemStyle: { color: c.curve },
    z: 3,
  })

  series.push({
    name: SERIES.wind,
    type: 'line',
    yAxisIndex: 1,
    data: hours.map((h, i) => [i, h.wind_100m]),
    showSymbol: false,
    lineStyle: { color: c.wind, width: 1, opacity: 0.9 },
    itemStyle: { color: c.wind },
    z: 2,
  })

  if (withActual) {
    series.push({
      name: SERIES.actual,
      type: 'line',
      data: hours.map((h, i) => [i, h.actual ?? null]),
      showSymbol: false,
      lineStyle: { color: c.actual, width: 1.5 },
      itemStyle: { color: c.actual },
      z: 4,
    })
  }

  const legendData: Record<string, unknown>[] = [{ name: mainName }]
  if (station) legendData.push({ name: SERIES.band, icon: 'rect', itemStyle: { color: c.band } })
  legendData.push({ name: curveName }, { name: SERIES.wind })
  if (withActual) legendData.push({ name: SERIES.actual })

  const tooltip = (params: unknown) => {
    const list = (Array.isArray(params) ? params : [params]) as AxisParam[]
    const i = list[0]?.dataIndex
    const h = i == null ? undefined : hours[i]
    if (!h) return ''
    const row = (label: string, value: string, color?: string) =>
      `<div class="fc-tt-row">${color ? `<i style="background:${color}"></i>` : '<i></i>'}<span>${label}</span><b>${value}</b></div>`
    const rows = [
      row(station ? 'Прогноз' : objectLabel(obj), pct(valueOf(h, obj)), mainColor),
      station ? row('Вероятно от–до', `${pct(h.p10)} – ${pct(h.p90)}`, c.band) : '',
      row(curveName, pct(h.curve), c.curve),
      row('Ветер 100 м', h.wind_100m == null ? '—' : `${num(h.wind_100m)} м/с`, c.wind),
      row('Т1 · Т2', `${pct(h.t1)} · ${pct(h.t2)}`),
      h.actual != null ? row(SERIES.actual, pct(h.actual), c.actual) : '',
    ]
    return (
      `<div class="fc-tt"><div class="fc-tt-head">${esc(dayLabel(h.time))} · ${esc(hourOf(h.time))}` +
      `<span>${h.lead_day === 1 ? 'завтра' : 'послезавтра'}</span></div>${rows.join('')}</div>`
    )
  }

  return {
    animationDuration: 400,
    textStyle: { fontFamily: 'Manrope, system-ui, sans-serif' },
    grid: { left: 44, right: narrow ? 12 : 52, top: 34, bottom: narrow ? 84 : 64 },
    legend: {
      bottom: 0,
      data: legendData,
      itemWidth: 16,
      itemHeight: 8,
      itemGap: 14,
      textStyle: { color: c.text2, fontSize: 12 },
      inactiveColor: c.text3,
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'line', lineStyle: { color: c.borderStrong, width: 1 } },
      backgroundColor: c.surfaceSolid,
      borderColor: c.borderStrong,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: c.text, fontSize: 12 },
      extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);',
      formatter: tooltip,
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: last,
      interval: narrow ? 6 : 3,
      axisLine: { lineStyle: { color: c.borderStrong } },
      axisTick: { lineStyle: { color: c.borderStrong } },
      splitLine: { show: false },
      axisLabel: {
        color: c.text3,
        fontSize: 11,
        showMaxLabel: false,
        formatter: (v: number) => {
          const h = hours[Math.round(v)]
          if (!h || Math.round(v) !== v) return ''
          const t = hourOf(h.time)
          return t === '00:00' ? `${t}\n{d|${ddmm(h.time)}}` : t
        },
        rich: { d: { color: c.text2, fontWeight: 600, fontSize: 11, padding: [2, 0, 0, 0] } },
      },
    },
    yAxis: [
      {
        type: 'value',
        min: 0,
        max: 1,
        interval: 0.25,
        axisLabel: { color: c.text3, fontSize: 11, formatter: (v: number) => pct(v) },
        splitLine: { lineStyle: { color: c.border, type: 'dashed' } },
      },
      {
        type: 'value',
        min: 0,
        max: windMax,
        interval: windMax / 4,
        position: 'right',
        show: !narrow,
        axisLabel: { color: c.text3, fontSize: 11, formatter: (v: number) => `${num(v, 0)} м/с` },
        splitLine: { show: false },
      },
    ],
    series,
  }
}
