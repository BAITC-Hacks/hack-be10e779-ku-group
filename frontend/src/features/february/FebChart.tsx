// Графики вкладки «Февраль»: столбцы выработки по целевым суткам и (если бэкенд отдаёт final_hours) почасовой итоговый ряд.
// Только прогноз — факта за февраль нет. Цвета — из CSS-переменных темы.

import { useMemo } from 'react'
import { EChart, type ChartOption } from '../../components/EChart'
import type { Theme } from '../../app/shared'
import { cssVar } from '../../lib/theme'
import { addDays, dateShort, dateTime, esc, hoursFull, num, pct, weekday } from '../../lib/format'
import { tr, useT } from '../../i18n'
import { ddmm, type FebData, type FebRun } from './febData'

function palette() {
  return {
    primary: cssVar('--primary'),
    band: cssVar('--primary-band'),
    warn: cssVar('--warn'),
    text: cssVar('--text'),
    text3: cssVar('--text-3'),
    border: cssVar('--border'),
    surface: cssVar('--surface-solid'),
    mono: cssVar('--mono'),
  }
}

type ClickParams = { componentType?: string; seriesId?: string; dataIndex?: number; value?: unknown }

/** Столбцы: выработка D+1 по 28 целевым суткам; D+2 — прогноз на те же сутки из выпуска на день раньше. */
export function FebBarsChart(props: { items: FebRun[]; theme: Theme; onOpen: (issue: string) => void }) {
  const { items, theme, onOpen } = props
  const { t, locale } = useT()
  const byIssue = useMemo(() => new Map(items.map((r) => [r.issue, r])), [items])
  // D+2 на сутки T — из выпуска T−2
  const d2 = useMemo(
    () => items.map((r) => byIssue.get(addDays(r.d1, -2)) ?? null).map((p) => (p?.energyD2 != null ? p : null)),
    [items, byIssue],
  )
  const hasD2 = d2.some(Boolean)

  const option = useMemo<ChartOption>(() => {
    void theme // цвета читаются из CSS-переменных текущей темы
    void locale // подписи и тултипы — через tr() на текущем языке
    const c = palette()
    return {
      animationDuration: 300,
      grid: { left: 8, right: 8, top: 28, bottom: 4, containLabel: true },
      legend: { show: false }, // легенда — HTML под графиком (там же цвет предупреждений)
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: c.band } },
        backgroundColor: c.surface,
        borderColor: c.border,
        textStyle: { color: c.text, fontSize: 12 },
        formatter: (ps: { dataIndex: number }[]) => {
          const i = ps[0]?.dataIndex
          const r = i == null ? undefined : items[i]
          if (!r) return ''
          const lines = [
            `<b>${esc(dateShort(r.d1))}, ${esc(weekday(r.d1))}</b>`,
            tr('february.chart.tipD1', { issue: esc(ddmm(r.issue)), hours: `<b>${hoursFull(r.energyD1)}</b>`, share: pct(r.energyD1 / 24) }),
          ]
          const p = d2[i]
          if (p?.energyD2 != null)
            lines.push(tr('february.chart.tipD2', { issue: esc(ddmm(p.issue)), hours: hoursFull(p.energyD2), share: pct(p.energyD2 / 24) }))
          lines.push(r.flags.length ? tr('february.chart.tipWarns', { n: r.flags.length }) : tr('february.chart.tipNone'))
          lines.push(`<span style="opacity:.7">${esc(tr('february.chart.tipFoot'))}</span>`)
          return lines.join('<br/>')
        },
      },
      xAxis: {
        type: 'category',
        data: items.map((r) => r.d1),
        triggerEvent: true,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: c.border } },
        axisLabel: { color: c.text3, fontFamily: c.mono, fontSize: 11, formatter: (v: string) => String(Number(v.slice(8, 10))) },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 24,
        interval: 6,
        name: tr('february.chart.yName'),
        nameLocation: 'end',
        nameTextStyle: { color: c.text3, fontSize: 11, align: 'left' },
        axisLabel: { color: c.text3, fontFamily: c.mono, fontSize: 11 },
        splitLine: { lineStyle: { color: c.border } },
      },
      series: [
        {
          id: 'd1',
          name: tr('february.chart.seriesD1'),
          type: 'bar',
          barMaxWidth: 16,
          barGap: '15%',
          itemStyle: { color: c.primary, borderRadius: [3, 3, 0, 0] },
          data: items.map((r) => ({
            value: r.energyD1,
            itemStyle: r.flags.length ? { color: c.warn } : undefined,
          })),
        },
        ...(hasD2
          ? [
              {
                id: 'd2',
                name: tr('february.chart.seriesD2'),
                type: 'bar',
                barMaxWidth: 16,
                itemStyle: { color: c.primary, opacity: 0.35, borderRadius: [3, 3, 0, 0] },
                data: d2.map((p) => (p?.energyD2 != null ? p.energyD2 : null)),
              },
            ]
          : []),
      ],
    }
  }, [items, d2, hasD2, theme, locale])

  const handleClick = (raw: unknown) => {
    const p = raw as ClickParams
    if (p.componentType === 'xAxis' && typeof p.value === 'string') {
      const r = items.find((x) => x.d1 === p.value)
      if (r) onOpen(r.issue)
      return
    }
    if (p.componentType !== 'series' || p.dataIndex == null) return
    if (p.seriesId === 'd2') {
      const src = d2[p.dataIndex]
      if (src) onOpen(src.issue)
      return
    }
    const r = items[p.dataIndex]
    if (r) onOpen(r.issue)
  }

  return (
    <EChart
      option={option}
      height={300}
      theme={theme}
      onClick={handleClick}
      ariaLabel={t('february.chart.aria')}
    />
  )
}

/** Итоговый ряд февраля (v2: final_hours) — каждый час из самого свежего выпуска, p50 и интервал p10–p90, % номинала. */
export function FebFinalChart(props: { hours: FebData['finalHours']; theme: Theme }) {
  const { hours, theme } = props
  const { t, locale } = useT()
  const option = useMemo<ChartOption>(() => {
    void theme
    void locale
    const c = palette()
    const r1 = (v: number) => Math.round(v * 1000) / 10
    return {
      animationDuration: 300,
      grid: { left: 8, right: 8, top: 28, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: c.surface,
        borderColor: c.border,
        textStyle: { color: c.text, fontSize: 12 },
        formatter: (ps: { dataIndex: number }[]) => {
          const h = hours[ps[0]?.dataIndex ?? -1]
          if (!h) return ''
          return [
            `<b>${esc(dateTime(h.time))}</b>`,
            tr('february.chart.final.tipP50', { value: `<b>${pct(h.p50)}</b>` }),
            tr('february.chart.final.tipRange', { lo: pct(h.p10), hi: pct(h.p90) }),
            tr('february.chart.final.tipIssued', { date: esc(ddmm(h.issue_date)) }),
          ].join('<br/>')
        },
      },
      xAxis: {
        type: 'category',
        data: hours.map((h) => h.time),
        boundaryGap: false,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: c.border } },
        axisLabel: {
          color: c.text3,
          fontFamily: c.mono,
          fontSize: 11,
          interval: (_: number, v: string) => v.endsWith('T00:00') && (Number(v.slice(8, 10)) - 1) % 7 === 0,
          formatter: (v: string) => ddmm(v),
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        interval: 25,
        name: tr('february.chart.final.yName'),
        nameTextStyle: { color: c.text3, fontSize: 11, align: 'left' },
        axisLabel: { color: c.text3, fontFamily: c.mono, fontSize: 11 },
        splitLine: { lineStyle: { color: c.border } },
      },
      series: [
        {
          id: 'lo',
          type: 'line',
          stack: 'band',
          symbol: 'none',
          silent: true,
          lineStyle: { opacity: 0 },
          data: hours.map((h) => r1(h.p10)),
        },
        {
          id: 'band',
          name: tr('february.chart.final.band'),
          type: 'line',
          stack: 'band',
          symbol: 'none',
          silent: true,
          lineStyle: { opacity: 0 },
          areaStyle: { color: c.band },
          data: hours.map((h) => r1(Math.max(0, h.p90 - h.p10))),
        },
        {
          id: 'p50',
          name: tr('february.chart.final.p50'),
          type: 'line',
          symbol: 'none',
          lineStyle: { color: c.primary, width: 1.5 },
          data: hours.map((h) => r1(h.p50)),
        },
      ],
    }
  }, [hours, theme, locale])

  return (
    <EChart
      option={option}
      height={220}
      theme={theme}
      ariaLabel={t('february.chart.final.aria', { n: num(hours.length, 0) })}
    />
  )
}
