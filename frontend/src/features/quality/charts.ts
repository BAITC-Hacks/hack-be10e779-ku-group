// Опции ECharts для вкладки «Качество». Цвета — только из CSS-переменных темы (cssVar); вызывать в useMemo с theme в зависимостях.

import type { HistoryPoint, HoldoutPoint } from '../../api/types'
import type { Theme } from '../../app/shared'
import type { ChartOption } from '../../components/EChart'
import { dateRu, dateTime, hourOf, num, pct } from '../../lib/format'
import { cssVar } from '../../lib/theme'
import { KIND_COLOR, methodLabel, type LeadGroup, type MethodKind } from './model'

type Colors = ReturnType<typeof readColors>

/** Цвета текущей темы. theme не читается — это ключ пересчёта: data-theme уже выставлен до рендера (App.tsx). */
export function readColors(_theme: Theme) {
  return {
    text: cssVar('--text'),
    text2: cssVar('--text-2'),
    text3: cssVar('--text-3'),
    border: cssVar('--border'),
    borderStrong: cssVar('--border-strong'),
    surface: cssVar('--surface-solid'),
    primary: cssVar('--primary'),
    band: cssVar('--primary-band'),
    curve: cssVar('--curve'),
    actual: cssVar('--actual'),
    wind: cssVar('--wind'),
    font: cssVar('--font'),
    mono: cssVar('--mono'),
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
const toPct = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10000) / 100)
const dot = (color: string, dashed = false) =>
  dashed
    ? `<span style="display:inline-block;width:10px;border-top:2px dashed ${color};margin-right:6px;vertical-align:middle"></span>`
    : `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px"></span>`
const row = (marker: string, label: string, value: string) =>
  `<div style="display:flex;justify-content:space-between;gap:16px"><span>${marker}${esc(label)}</span><b>${esc(value)}</b></div>`

function tooltipBase(c: Colors) {
  return {
    trigger: 'axis',
    backgroundColor: c.surface,
    borderColor: c.borderStrong,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: c.text, fontFamily: c.font, fontSize: 12 },
    axisPointer: { type: 'line', lineStyle: { color: c.borderStrong } },
  }
}

function legendBase(c: Colors) {
  return {
    top: 0,
    left: 0,
    itemWidth: 16,
    itemHeight: 8,
    textStyle: { color: c.text2, fontFamily: c.font, fontSize: 12 },
  }
}

/** Ось времени: каждые 6 ч, на полночь — дата. */
function timeAxis(c: Colors, times: string[]) {
  return {
    type: 'category',
    data: times,
    boundaryGap: false,
    axisLine: { lineStyle: { color: c.border } },
    axisTick: { show: false },
    axisLabel: {
      color: c.text2,
      fontFamily: c.mono,
      fontSize: 11,
      interval: 5,
      formatter: (v: string) => (hourOf(v) === '00:00' ? dateRu(v).slice(0, 5) : hourOf(v)),
    },
  }
}

function powerAxis(c: Colors) {
  return {
    type: 'value',
    min: 0,
    max: 100,
    interval: 25,
    name: '% номинала',
    nameTextStyle: { color: c.text3, fontFamily: c.font, fontSize: 11, align: 'left' },
    axisLabel: { color: c.text2, fontFamily: c.mono, fontSize: 11, formatter: '{value} %' },
    splitLine: { lineStyle: { color: c.border } },
  }
}

// ---------- MAE по методам, D+1 и D+2 ----------

export function maeBarsOption(groups: LeadGroup[], theme: Theme): ChartOption {
  const c = readColors(theme)
  const leads = groups.map((g) => g.lead)
  // серии — методы в порядке модель / кривая / персистентность / прочие (по названию из API)
  const methods: { name: string; kind: MethodKind }[] = []
  for (const g of groups)
    for (const r of g.rows) if (!methods.some((m) => m.name === r.name)) methods.push({ name: r.name, kind: r.kind })
  const colorOf = (k: MethodKind) => cssVar(KIND_COLOR[k])
  const labelOf = (m: { name: string; kind: MethodKind }) => methodLabel(m.name, m.kind)

  return {
    grid: { left: 48, right: 12, top: 56, bottom: 28 },
    legend: legendBase(c),
    tooltip: {
      ...tooltipBase(c),
      axisPointer: { type: 'shadow', shadowStyle: { color: c.band, opacity: 0.4 } },
      formatter: (ps: { axisValue: string; seriesName: string; value: number | null; color: string }[]) =>
        `<div style="margin-bottom:4px">Сутки ${esc(ps[0]?.axisValue ?? '')} · MAE, % номинала</div>` +
        ps.map((p) => row(dot(p.color), p.seriesName, p.value == null ? '—' : `${num(p.value, 1)} %`)).join(''),
    },
    xAxis: {
      type: 'category',
      data: leads,
      axisLine: { lineStyle: { color: c.border } },
      axisTick: { show: false },
      axisLabel: { color: c.text, fontFamily: c.mono, fontSize: 12, formatter: (v: string) => `Сутки ${v}` },
    },
    yAxis: {
      type: 'value',
      min: 0,
      name: 'MAE, % номинала',
      nameTextStyle: { color: c.text3, fontFamily: c.font, fontSize: 11, align: 'left' },
      axisLabel: { color: c.text2, fontFamily: c.mono, fontSize: 11, formatter: '{value} %' },
      splitLine: { lineStyle: { color: c.border } },
    },
    series: methods.map((m) => ({
      type: 'bar',
      name: labelOf(m),
      barMaxWidth: 40,
      barGap: '18%',
      itemStyle: { color: colorOf(m.kind), borderRadius: [4, 4, 0, 0], opacity: m.kind === 'persist' ? 0.75 : 1 },
      label: {
        show: true,
        position: 'top',
        color: c.text2,
        fontFamily: c.mono,
        fontSize: 11,
        formatter: (p: { value: number | null }) => (p.value == null ? '' : `${num(p.value, 1)} %`),
      },
      data: groups.map((g) => toPct(g.rows.find((r) => r.name === m.name)?.mae)),
    })),
  }
}

// ---------- прогноз против факта (P1 /api/holdout) ----------

export function holdoutOption(hours: HoldoutPoint[], theme: Theme): ChartOption {
  const c = readColors(theme)
  const times = hours.map((h) => h.time)
  const d2 = hours.find((h) => h.lead_day === 2)?.time
  const BAND = 'Интервал p10–p90'
  const line = (color: string, width: number, dashed = false) => ({
    type: 'line',
    symbol: 'none',
    connectNulls: false,
    itemStyle: { color },
    lineStyle: { color, width, type: dashed ? 'dashed' : 'solid' },
  })

  return {
    grid: { left: 52, right: 16, top: 56, bottom: 28 },
    legend: {
      ...legendBase(c),
      data: ['Факт', 'Прогноз p50', { name: BAND, icon: 'roundRect', itemStyle: { color: c.band } }, 'Кривая мощности'],
    },
    tooltip: {
      ...tooltipBase(c),
      formatter: (ps: { dataIndex: number }[]) => {
        const h = hours[ps[0]?.dataIndex ?? -1]
        if (!h) return ''
        return (
          `<div style="margin-bottom:4px">${esc(dateTime(h.time))} · сутки D+${h.lead_day}</div>` +
          row(dot(c.actual), 'Факт', pct(h.actual)) +
          row(dot(c.primary), 'Прогноз p50', pct(h.p50)) +
          row(`<span style="display:inline-block;width:10px;height:8px;border-radius:2px;background:${c.band};border:1px solid ${c.primary};margin-right:6px"></span>`, BAND, `${pct(h.p10)} – ${pct(h.p90)}`) +
          row(dot(c.curve, true), 'Кривая мощности', pct(h.curve))
        )
      },
    },
    xAxis: timeAxis(c, times),
    yAxis: powerAxis(c),
    series: [
      // интервал: невидимая база p10 + ширина (p90 − p10) с заливкой
      { ...line(c.band, 0), name: '__p10', stack: 'band', lineStyle: { opacity: 0 }, silent: true, data: hours.map((h) => toPct(h.p10)) },
      {
        ...line(c.band, 0),
        name: BAND,
        stack: 'band',
        lineStyle: { opacity: 0 },
        areaStyle: { color: c.band, opacity: 1 },
        silent: true,
        data: hours.map((h) => (h.p90 == null || h.p10 == null ? null : toPct(h.p90 - h.p10))),
      },
      { ...line(c.curve, 1.5, true), name: 'Кривая мощности', data: hours.map((h) => toPct(h.curve)) },
      {
        ...line(c.primary, 2),
        name: 'Прогноз p50',
        data: hours.map((h) => toPct(h.p50)),
        markLine: d2
          ? {
              symbol: 'none',
              silent: true,
              lineStyle: { color: c.borderStrong, type: 'dotted', width: 1 },
              label: { formatter: 'D+2', position: 'insideEndTop', color: c.text3, fontFamily: c.mono, fontSize: 11 },
              data: [{ xAxis: d2 }],
            }
          : undefined,
      },
      { ...line(c.actual, 2), name: 'Факт', data: hours.map((h) => toPct(h.actual)) },
    ],
  }
}

// ---------- только факт станции (пока нет /api/holdout) ----------

export function historyOption(points: HistoryPoint[], theme: Theme): ChartOption {
  const c = readColors(theme)
  const times = points.map((p) => p.time)
  const d2 = times.find((t) => t.slice(0, 10) !== times[0]?.slice(0, 10)) // первый час вторых суток
  const WIND = 'Ветер на турбинах (измерен), м/с'

  return {
    grid: { left: 52, right: 44, top: 56, bottom: 28 },
    legend: { ...legendBase(c), data: ['Факт', WIND] },
    tooltip: {
      ...tooltipBase(c),
      formatter: (ps: { dataIndex: number }[]) => {
        const p = points[ps[0]?.dataIndex ?? -1]
        if (!p) return ''
        return (
          `<div style="margin-bottom:4px">${esc(dateTime(p.time))}</div>` +
          row(dot(c.actual), 'Факт', pct(p.actual)) +
          row(dot(c.wind), 'Ветер (измерен)', p.wind_measured == null ? '—' : `${num(p.wind_measured)} м/с`)
        )
      },
    },
    xAxis: timeAxis(c, times),
    yAxis: [
      powerAxis(c),
      {
        type: 'value',
        min: 0,
        name: 'м/с',
        nameTextStyle: { color: c.text3, fontFamily: c.font, fontSize: 11 },
        axisLabel: { color: c.text2, fontFamily: c.mono, fontSize: 11 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        type: 'line',
        name: WIND,
        yAxisIndex: 1,
        symbol: 'none',
        connectNulls: false,
        itemStyle: { color: c.wind },
        lineStyle: { color: c.wind, width: 1.5, opacity: 0.9 },
        data: points.map((p) => (p.wind_measured == null ? null : Math.round(p.wind_measured * 100) / 100)),
      },
      {
        type: 'line',
        name: 'Факт',
        symbol: 'none',
        connectNulls: false,
        itemStyle: { color: c.actual },
        lineStyle: { color: c.actual, width: 2 },
        data: points.map((p) => toPct(p.actual)),
        markLine: d2
          ? {
              symbol: 'none',
              silent: true,
              lineStyle: { color: c.borderStrong, type: 'dotted', width: 1 },
              label: { formatter: 'D+2', position: 'insideEndTop', color: c.text3, fontFamily: c.mono, fontSize: 11 },
              data: [{ xAxis: d2 }],
            }
          : undefined,
      },
    ],
  }
}
