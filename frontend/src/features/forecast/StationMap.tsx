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
import type { ObjectId } from './model'

// Узлы сетки — latitude/longitude из ответов Open-Meteo, сохранённых в data/weather/*.json.
const WEATHER_NODES: { id: string; short: string; label: string; lat: number; lon: number }[] = [
  { id: 'best_match', short: 'Open-Meteo', label: 'Open-Meteo — лучшая модель для точки', lat: 43.620384, lon: 78.47891 },
  { id: 'ecmwf', short: 'ECMWF', label: 'ECMWF (Европа)', lat: 43.75, lon: 78.5 },
  { id: 'icon', short: 'ICON', label: 'ICON (Германия)', lat: 43.625, lon: 78.5 },
  { id: 'gfs', short: 'GFS', label: 'GFS (США)', lat: 43.638138, lon: 78.515625 },
  { id: 'jma', short: 'JMA', label: 'JMA (Япония)', lat: 43.5, lon: 78.5 },
  { id: 'cma', short: 'CMA', label: 'CMA (Китай)', lat: 43.6875, lon: 78.5 },
  { id: 'gem', short: 'GEM', label: 'GEM (Канада)', lat: 43.65001, lon: 78.600006 },
]

type View = 'station' | 'weather'

function km(a: [number, number], b: [number, number]): number {
  const R = 6371
  const rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad
  const dLon = (b[1] - a[1]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** "gfs_ws100" → { gfs: ['ветер 100 м'] }: агент исключает отдельные ряды модели, а не модель целиком. */
function excludedByNode(excluded: string[] | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const s of excluded ?? []) {
    const [id, what = ''] = s.split('_ws')
    const label = what ? `ветер ${what} м` : s
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

  const excluded = useMemo(() => excludedByNode(f?.excluded_sources), [f])
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
      for (const n of nodes) {
        const off = n.off.length > 0
        L.polyline([center, [n.lat, n.lon]], { color: off ? text3 : wind, weight: 1, dashArray: '4 4', opacity: 0.7 }).addTo(g)
        L.circleMarker([n.lat, n.lon], {
          radius: 7,
          color: off ? text3 : wind,
          weight: 2,
          dashArray: off ? '3 3' : undefined,
          fillColor: off ? 'transparent' : wind,
          fillOpacity: 0.4,
        })
          .bindTooltip(`${esc(n.short)} · ${num(n.dist)} км`, { permanent: true, direction: 'top', className: 'fc-map-label' })
          .addTo(g)
      }
    }

    for (const t of turbines) {
      const color = cssVar(t.id === 't1' ? '--t1' : '--t2')
      const e = turbineEnergy(f, t.id)
      const label = t.id === 't1' ? 'Турбина 1' : 'Турбина 2'
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
            (e != null ? `<br/>завтра: ${hoursFull(e)} работы на полной мощности` : '') +
            '<br/><i>график переключён на эту турбину</i>',
        )
        .on('click', () => onPick.current(t.id))
        .addTo(g)
    }
  }, [f, object, theme, turbines, center, view, nodes])

  // масштаб: станция крупно или все погодные узлы
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (view === 'station') {
      m.setView(center, 15)
    } else {
      const pts: [number, number][] = [center, ...nodes.map((n) => [n.lat, n.lon] as [number, number])]
      m.fitBounds(L.latLngBounds(pts), { padding: [40, 40] })
    }
  }, [view, center, nodes])

  const gap = turbines.length === 2 ? km([turbines[0].lat, turbines[0].lon], [turbines[1].lat, turbines[1].lon]) : null
  const nearest = nodes[0]

  return (
    <section className="card fc-map-card" aria-label="Станция на карте">
      <div className="card-head">
        <div>
          <div className="eyebrow">Станция на карте</div>
          <h2 className="card-title">
            {meta.station.name}
            {gap != null ? ` · турбины в ${Math.round(gap * 1000)} м друг от друга` : ''}
          </h2>
        </div>
        <div className="segmented" role="group" aria-label="Что показать на карте">
          <button aria-pressed={view === 'station'} onClick={() => setView('station')}>
            Турбины
          </button>
          <button aria-pressed={view === 'weather'} onClick={() => setView('weather')}>
            Откуда погода
          </button>
        </div>
      </div>

      <div className="fc-map-wrap">
        <div ref={box} className="fc-map" />
        <div className="fc-map-hint">Приблизить: «+», двойной клик или колесо мыши после клика по карте</div>
      </div>

      {view === 'station' ? (
        <p className="fc-map-text">
          Нажмите на турбину — график и цифры выше переключатся на её прогноз. Вернуться к станции целиком — переключатель
          «Станция» вверху страницы.
        </p>
      ) : (
        <div className="fc-map-text">
          <p>
            Прогноз погоды считают не для каждой точки, а на сетке: у каждой погодной модели свой ближайший к станции узел
            {nearest ? ` (самый близкий — ${nearest.short}, ${num(nearest.dist)} км)` : ''}. Агент берёт прогноз ветра из
            7 моделей, проверяет, как каждая ошибалась за последние 30 дней, и отбрасывает ненадёжные. Чем сильнее модели
            расходятся между собой, тем шире интервал неуверенности на графике.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Погодная модель</th>
                  <th className="r">До станции</th>
                  <th>В этом прогнозе</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => (
                  <tr key={n.id}>
                    <td>{n.label}</td>
                    <td className="r">{num(n.dist)} км</td>
                    <td>
                      {!f ? (
                        <span className="muted">—</span>
                      ) : n.off.length ? (
                        <span className="fc-map-off">исключено агентом: {n.off.join(', ')}</span>
                      ) : (
                        <span className="fc-map-on">используется</span>
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
        <Notice tone="info">Подложка карты не загрузилась (нет доступа к OpenStreetMap) — точки нанесены по координатам.</Notice>
      )}
    </section>
  )
}
