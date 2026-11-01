import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Faisalabad, used only when there is nothing else to centre on.
const FALLBACK_CENTER = [31.4504, 73.135]
const PALETTE = ['#b6472a', '#1e3a2f', '#3b5b7c', '#8a5a1c', '#6b3f7a', '#2f6f6f']

const pinIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:26px;height:26px;border-radius:50% 50% 50% 0;background:#3b5b7c;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"><span style="display:block;width:8px;height:8px;margin:7px;border-radius:50%;background:#fff"></span></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
})

/**
 * The city's blocks as zones, with the ones the shopper chose filled in. Tapping the
 * map drops a pin and calls `onPick(lat, lng)`. Used to shop (or deliver) somewhere
 * other than where the shopper is standing.
 */
export default function AreaMap({ zones, selectedIds = [], pin = null, onPick, height = 300, label = 'Map of delivery areas' }) {
  const container = useRef(null)
  const mapRef = useRef(null)
  const zoneLayer = useRef(null)
  const pinLayer = useRef(null)
  const fitted = useRef(false)
  const pickRef = useRef(onPick)
  useEffect(() => {
    pickRef.current = onPick
  })

  useEffect(() => {
    const map = L.map(container.current, { scrollWheelZoom: false }).setView(FALLBACK_CENTER, 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    zoneLayer.current = L.layerGroup().addTo(map)
    pinLayer.current = L.layerGroup().addTo(map)
    map.on('click', (e) => pickRef.current?.(e.latlng.lat, e.latlng.lng))
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      fitted.current = false
    }
  }, [])

  // The zones. A zone's name is a tooltip (set as text, never HTML).
  useEffect(() => {
    const layer = zoneLayer.current
    layer.clearLayers()
    const chosen = new Set(selectedIds)
    zones.forEach((zone, index) => {
      if (!zone.polygon) return
      const colour = PALETTE[index % PALETTE.length]
      const on = chosen.has(zone._id)
      const shape = L.polygon(zone.polygon, {
        color: colour,
        weight: on ? 2.5 : 1.5,
        fillColor: colour,
        fillOpacity: on ? 0.28 : 0.07,
      }).addTo(layer)
      const name = document.createElement('span')
      name.textContent = zone.name
      shape.bindTooltip(name, { sticky: true })
      // A tap on a zone is a tap on the map: the pin goes there.
      shape.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        pickRef.current?.(e.latlng.lat, e.latlng.lng)
      })
    })
    if (!fitted.current) {
      const points = zones.flatMap((z) => z.polygon || [])
      if (points.length > 0 && mapRef.current) {
        mapRef.current.fitBounds(L.latLngBounds(points), { padding: [20, 20], maxZoom: 15 })
        fitted.current = true
      }
    }
  }, [zones, selectedIds])

  useEffect(() => {
    const layer = pinLayer.current
    layer.clearLayers()
    if (pin) L.marker([pin.lat, pin.lng], { icon: pinIcon, title: 'Your pin', interactive: false }).addTo(layer)
  }, [pin])

  return <div ref={container} role="region" aria-label={label} style={{ height }} className="isolate z-0 w-full overflow-hidden rounded-lg border border-line" />
}
