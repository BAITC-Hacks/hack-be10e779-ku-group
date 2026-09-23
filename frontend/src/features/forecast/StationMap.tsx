// Карта станции: две турбины по координатам из ТЗ; во втором режиме — «откуда погода»: ближайшие узлы сетки 7 погодных
// моделей, из которых агент берёт прогноз ветра, и какие из них он исключил в этом прогнозе. Подложка — OpenStreetMap
// (нужен интернет; без него точки всё равно нанесены по координатам). Leaflet без react-leaflet (лицензия, docs/toolbox.md).

import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Forecast, Meta } from '../../api/types'
import { Notice } from '../../components/ui'
import { esc, hoursFull, num } from '../../lib/format'
import { cssVar } from '../../lib/theme'
import { tr, useT, type TKey } from '../../i18n'
import type { ObjectId } from './model'
import { rich } from './rich'

// Узлы сетки — latitude/longitude из ответов Open-Meteo, сохранённых в data/weather/*.json.
// Высоты ветра — как в backend/app/forecast/weather.py (у JMA, CMA и GEM в архиве только ветер на 10 м).
// label и heights — ключи словаря forecast.map.* (переводятся при показе)
const H2: TKey = 'forecast.map.heights10and100'
const H1: TKey = 'forecast.map.heights10only'
const WEATHER_NODES: { id: string; short: string; label: TKey; heights: TKey; lat: number; lon: number }[] = [
  { id: 'best_match', short: 'Open-Meteo', label: 'forecast.map.nodes.best_match', heights: H2, lat: 43.620384, lon: 78.47891 },
  { id: 'ecmwf', short: 'ECMWF', label: 'forecast.map.nodes.ecmwf', heights: H2, lat: 43.75, lon: 78.5 },
  { id: 'icon', short: 'ICON', label: 'forecast.map.nodes.icon', heights: H2, lat: 43.625, lon: 78.5 },
  { id: 'gfs', short: 'GFS', label: 'forecast.map.nodes.gfs', heights: H2, lat: 43.638138, lon: 78.515625 },
  { id: 'jma', short: 'JMA', label: 'forecast.map.nodes.jma', heights: H1, lat: 43.5, lon: 78.5 },
  { id: 'cma', short: 'CMA', label: 'forecast.map.nodes.cma', heights: H1, lat: 43.6875, lon: 78.5 },
  { id: 'gem', short: 'GEM', label: 'forecast.map.nodes.gem', heights: H1, lat: 43.65001, lon: 78.600006 },
]

type View = 'station' | 'weather'

const NEAR_KM = 8

function km(a: [number, number], b: [number, number]): number {
  const R = 6371
  const rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad
  const dLon = (b[1] - a[1]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** "gfs_ws100" → { gfs: ['ветер 100 м'] }: агент исключает отдельные ряды модели, а не модель целиком. */
// _locale — только чтобы useMemo пересчитывал подписи при смене языка
function excludedByNode(excluded: string[] | undefined, _locale: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const s of excluded ?? []) {
    const [id, what = ''] = s.split('_ws')
    const label = what ? tr('forecast.map.wind', { h: what }) : s
    out.set(id, [...(out.get(id) ?? []), label])
  }
  return out
}

function turbineEnergy(f: Forecast | null, id: 't1' | 't2'): number | null {
  if (!f) return null
  const vals = f.hours.filter((h) => h.lead_day === 1).map((h) => h[id])
  return vals.every((v) => v != null) ? vals.reduce<number>((s, v) => s + (v ?? 0), 0) : null
}

export function StationMap(props: {
  meta: Meta
  f: Forecast | null
  object: ObjectId
  onObjectChange: (o: ObjectId) => void
  theme: string
}) {
  const { t, locale } = useT()
  const { meta, f, object, onObjectChange, theme } = props
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const onPick = useRef(onObjectChange)
  const [view, setView] = useState<View>('station')
  const [tilesFailed, setTilesFailed] = useState(false)

  useEffect(() => {
    onPick.current = onObjectChange
  })

  const turbines = meta.turbines
  const center = useMemo<[number, number]>(() => {
    const lat = turbines.reduce((s, t) => s + t.lat, 0) / turbines.length
    const lon = turbines.reduce((s, t) => s + t.lon, 0) / turbines.length
    return [lat, lon]
  }, [turbines])

  // подписи исключённых рядов переводятся — пересчитываем при смене языка
  const excluded = useMemo(() => excludedByNode(f?.excluded_sources, locale), [f, locale])
  const nodes = useMemo(
    () => WEATHER_NODES.map((n) => ({ ...n, dist: km(center, [n.lat, n.lon]), off: excluded.get(n.id) ?? [] })).sort((a, b) => a.dist - b.dist),
    [center, excluded],
  )

  // карта создаётся один раз. Колесо мыши включается после клика по карте — иначе оно перехватывает прокрутку страницы.
  useEffect(() => {
    if (!box.current) return
    const m = L.map(box.current, { zoomControl: true, scrollWheelZoom: false, maxZoom: 18 })
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    })
    let failures = 0
    tiles.on('tileerror', () => {
      failures += 1
      if (failures >= 3) setTilesFailed(true)
    })
    tiles.on('tileload', () => setTilesFailed(false))
    tiles.addTo(m)
    m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>')
    m.on('click focus', () => m.scrollWheelZoom.enable())
    m.on('blur mouseout', () => m.scrollWheelZoom.disable())
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(box.current)
    return () => {
      ro.disconnect()
      m.remove()
      map.current = null
    }
  }, [])

  // точки: турбины всегда; узлы погоды и линии «откуда прогноз» — только в режиме «Откуда погода»
  useEffect(() => {
    const g = layer.current
    if (!g) return
    g.clearLayers()

    if (view === 'weather') {
      const wind = cssVar('--wind')
      const text3 = cssVar('--text-3')
      nodes.forEach((n, i) => {
        const off = n.off.length > 0
        L.polyline([center, [n.lat, n.lon]], { color: off ? text3 : wind, weight: 1, dashArray: '4 4', opacity: 0.7 }).addTo(g)
        L.marker([n.lat, n.lon], {
          icon: L.divIcon({ className: `fc-node${off ? ' fc-node-off' : ''}`, html: String(i + 1), iconSize: [22, 22] }),
          keyboard: false,
        })
          .bindTooltip(`<b>${i + 1}. ${esc(tr(n.label))}</b><br/>${esc(tr('forecast.map.nodeTooltip', { km: num(n.dist), heights: tr(n.heights) }))}`, {
            direction: 'top',
            offset: [0, -10],
          })
          .addTo(g)
      })
      // обе турбины — точками своих цветов, без постоянных подписей (338 м друг от друга; номера узлов поверх)
      for (const t of turbines) {
        L.circleMarker([t.lat, t.lon], {
          radius: 6,
          color: cssVar(t.id === 't1' ? '--t1' : '--t2'),
          weight: 2,
          fillColor: cssVar(t.id === 't1' ? '--t1' : '--t2'),
          fillOpacity: 0.9,
        })
          .bindTooltip(tr(t.id === 't1' ? 'forecast.objects.t1' : 'forecast.objects.t2'), { direction: 'top', offset: [0, -6] })
          .on('click', () => onPick.current(t.id))
          .addTo(g)
      }
      return
    }

    for (const t of turbines) {
      const color = cssVar(t.id === 't1' ? '--t1' : '--t2')
      const e = turbineEnergy(f, t.id)
      const label = esc(tr(t.id === 't1' ? 'forecast.objects.t1' : 'forecast.objects.t2'))
      const active = object === t.id
      L.circleMarker([t.lat, t.lon], {
        radius: active ? 12 : 9,
        color,
        weight: active ? 4 : 2,
        fillColor: color,
        fillOpacity: active || object === 'station' ? 0.85 : 0.35,
      })
        .bindTooltip(label, { permanent: true, direction: 'right', className: 'fc-map-label' })
        .bindPopup(
          `<b>${label}</b><br/>${num(t.lat, 5)}, ${num(t.lon, 5)}` +
            (e != null ? `<br/>${esc(tr('forecast.map.popupTomorrow', { hours: hoursFull(e) }))}` : '') +
            `<br/><i>${esc(tr('forecast.map.popupSwitched'))}</i>`,
        )
        .on('click', () => onPick.current(t.id))
        .addTo(g)
    }
  }, [f, object, theme, turbines, center, view, nodes, locale])

  // масштаб: станция крупно или все погодные узлы
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (view === 'station') {
      m.setView(center, 15)
    } else {
      // ближний круг (до 8 км) — чтобы соседние узлы не слипались; дальние видны при отдалении
      const near = nodes.filter((n) => n.dist < NEAR_KM)
      const pts: [number, number][] = [center, ...near.map((n) => [n.lat, n.lon] as [number, number])]
      m.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: 13 })
    }
  }, [view, center, nodes])

  const gap = turbines.length === 2 ? km([turbines[0].lat, turbines[0].lon], [turbines[1].lat, turbines[1].lon]) : null
  const nearest = nodes[0]
  const far = nodes.filter((n) => n.dist >= NEAR_KM)

  return (
    <section className="card fc-map-card" aria-label={t('forecast.map.aria')}>
      <div className="card-head">
        <div>
          <div className="eyebrow">{t('forecast.map.eyebrow')}</div>
          <h2 className="card-title">
            {meta.station.name}
            {gap != null ? t('forecast.map.gap', { m: Math.round(gap * 1000) }) : ''}
          </h2>
        </div>
        <div className="segmented" role="group" aria-label={t('forecast.map.viewAria')}>
          <button aria-pressed={view === 'station'} onClick={() => setView('station')}>
            {t('forecast.map.turbines')}
          </button>
          <button aria-pressed={view === 'weather'} onClick={() => setView('weather')}>
            {t('forecast.map.weather')}
          </button>
        </div>
      </div>

      <div className="fc-map-wrap">
        <div ref={box} className="fc-map" />
      </div>
      <div className="fc-map-hint">
        {view === 'weather' && (
          <>
            <i className="fc-map-dot" style={{ background: 'var(--t1)' }} /> {t('forecast.objects.t1Short')}{' '}
            <i className="fc-map-dot" style={{ background: 'var(--t2)' }} /> {t('forecast.objects.t2Short')} ·{' '}
            {rich(t('forecast.map.legend'), { node: <i className="fc-node fc-legend-node">1</i> })}
          </>
        )}
        {t('forecast.map.zoom')}
      </div>

      {view === 'station' ? (
        <p className="fc-map-text">{t('forecast.map.stationText')}</p>
      ) : (
        <div className="fc-map-text">
          <p>
            {t('forecast.map.weatherText1')}
            {nearest ? t('forecast.map.nearest', { name: nearest.short, km: num(nearest.dist) }) : ''}
            {t('forecast.map.weatherText2')}
            {far.length > 0 &&
              t('forecast.map.far', { list: far.map((n) => n.short).join(t('forecast.map.farJoin')), km: NEAR_KM })}
            {t('forecast.map.weatherText3')}
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('forecast.map.colNo')}</th>
                  <th>{t('forecast.map.colSource')}</th>
                  <th className="r">{t('forecast.map.colDist')}</th>
                  <th>{t('forecast.map.colWind')}</th>
                  <th>{t('forecast.map.colUsed')}</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n, i) => (
                  <tr key={n.id}>
                    <td className="mono">{i + 1}</td>
                    <td>{t(n.label)}</td>
                    <td className="r">
                      {num(n.dist)} {t('forecast.unit.km')}
                    </td>
                    <td>{t(n.heights)}</td>
                    <td>
                      {!f ? (
                        <span className="muted">—</span>
                      ) : n.off.length ? (
                        <span className="fc-map-off">{t('forecast.map.excluded', { list: n.off.join(', ') })}</span>
                      ) : (
                        <span className="fc-map-on">{t('forecast.map.used')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tilesFailed && (
        <Notice tone="info">{t('forecast.map.tilesFailed')}</Notice>
      )}
    </section>
  )
}
