import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Faisalabad, used only when there is nothing else to centre on.
const FALLBACK_CENTER = [31.4504, 73.135]

const cornerIcon = (number) =>
  L.divIcon({
    className: '',
    html: `<span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#b6472a;color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);font:600 11px system-ui,sans-serif">${number}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })

// A name label made with DOM nodes and textContent, never an HTML string,
// so a block name can never inject markup.
function labelIcon(name) {
  const el = document.createElement('span')
  el.textContent = name
  el.style.cssText =
    'display:inline-block;transform:translate(-50%,-50%);white-space:nowrap;font:600 11px system-ui,sans-serif;color:#4b4339;text-shadow:0 0 3px #fff,0 0 3px #fff'
  return L.divIcon({ className: '', html: el, iconSize: [0, 0] })
}

/**
 * Draws a block's zone on a map. Click to add a corner, drag a corner to move it,
 * right-click (or double-click) a corner to remove it. `ring` is an open list of
 * [lat, lng] pairs. Other blocks of the city show as grey outlines, so overlaps
 * and gaps are easy to see.
 */
export default function ZoneEditor({ ring, onChange, others = [] }) {
  const container = useRef(null)
  const mapRef = useRef(null)
  const drawRef = useRef(null)
  const othersRef = useRef(null)
  const fitted = useRef(false)
  // The click handler is attached once, so it reads the latest values from here.
  const live = useRef({ ring, onChange })
  useEffect(() => {
    live.current = { ring, onChange }
  })

  useEffect(() => {
    const map = L.map(container.current, { scrollWheelZoom: true, doubleClickZoom: false }).setView(FALLBACK_CENTER, 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    othersRef.current = L.layerGroup().addTo(map)
    drawRef.current = L.layerGroup().addTo(map)
    map.on('click', (e) => {
      const { ring: current, onChange: change } = live.current
      change([...current, [round(e.latlng.lat), round(e.latlng.lng)]])
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      fitted.current = false
    }
  }, [])

  // Other blocks, as grey outlines with their names.
  useEffect(() => {
    const layer = othersRef.current
    layer.clearLayers()
    for (const other of others) {
      if (!other.polygon) continue
      L.polygon(other.polygon, { color: '#8a8175', weight: 1.5, dashArray: '5 4', fillOpacity: 0.06, interactive: false }).addTo(layer)
      const lats = other.polygon.map((p) => p[0])
      const lngs = other.polygon.map((p) => p[1])
      L.marker([(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2], {
        icon: labelIcon(other.name),
        interactive: false,
        keyboard: false,
      }).addTo(layer)
    }
  }, [others])

  // The outline being drawn, with a numbered, draggable marker on each corner.
  useEffect(() => {
    const layer = drawRef.current
    layer.clearLayers()
    if (ring.length >= 3) {
      L.polygon(ring, { color: '#b6472a', weight: 2, fillOpacity: 0.18, interactive: false }).addTo(layer)
    } else if (ring.length === 2) {
      L.polyline(ring, { color: '#b6472a', weight: 2, interactive: false }).addTo(layer)
    }
    ring.forEach((corner, index) => {
      const marker = L.marker(corner, { icon: cornerIcon(index + 1), draggable: true, title: `Corner ${index + 1}` }).addTo(layer)
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng()
        const next = live.current.ring.map((c, i) => (i === index ? [round(lat), round(lng)] : c))
        live.current.onChange(next)
      })
      const remove = () => live.current.onChange(live.current.ring.filter((_, i) => i !== index))
      marker.on('contextmenu', remove)
      marker.on('dblclick', remove)
    })
  }, [ring])

  // Frame the map once: on this block's outline, else on its neighbours.
  useEffect(() => {
    const map = mapRef.current
    if (!map || fitted.current) return
    const points = ring.length >= 3 ? ring : others.flatMap((o) => o.polygon || [])
    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 16 })
      fitted.current = true
    }
  }, [ring, others])

  return (
    <div>
      <div ref={container} className="h-[420px] w-full rounded-card border border-line-warm" role="application" aria-label="Map for drawing the block's outline" />
      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[12.5px]">
        <span className="text-ink/55">
          {ring.length === 0
            ? 'Click the map to place the first corner.'
            : `${ring.length} corner${ring.length === 1 ? '' : 's'}${ring.length < 3 ? ' (at least 3 needed)' : ''}. Drag a corner to move it, right-click it to remove it.`}
        </span>
        <button
          type="button"
          onClick={() => onChange(ring.slice(0, -1))}
          disabled={ring.length === 0}
          className="rounded-tile border border-line-warm px-3 py-1.5 font-medium text-ink transition hover:border-ink disabled:opacity-40"
        >
          Undo last corner
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          disabled={ring.length === 0}
          className="rounded-tile border border-line-warm px-3 py-1.5 font-medium text-ink transition hover:border-ink disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  )
}

const round = (n) => Math.round(n * 1e5) / 1e5
