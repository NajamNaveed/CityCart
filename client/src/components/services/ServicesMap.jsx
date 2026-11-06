import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatDistance } from '../../utils/geo'
import { formatPrice } from '../../ui'

const FALLBACK_CENTER = [31.4504, 73.135]

const pinIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:26px;height:26px;border-radius:50% 50% 50% 0;background:#1e3a2f;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"><span style="display:block;width:8px;height:8px;margin:7px;border-radius:50%;background:#fff"></span></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  popupAnchor: [0, -26],
})

// Built with DOM nodes and textContent, never HTML strings, so a provider's
// name can never inject markup.
function popupFor(provider, onOpenProvider) {
  const root = document.createElement('div')
  root.style.cssText = 'min-width:170px;font:13px/1.4 system-ui,sans-serif'
  const add = (tag, text, css) => {
    const el = document.createElement(tag)
    el.textContent = text
    if (css) el.style.cssText = css
    root.appendChild(el)
    return el
  }
  add('strong', provider.displayName, 'display:block;font-size:14px')
  if (provider.category?.name) add('span', provider.category.name, 'display:block;color:#6f6256')
  if (provider.block?.name) add('span', provider.block.name, 'display:block;color:#6f6256')
  add('span', `From ${formatPrice(provider.startingAtPrice / 100)}`, 'display:block;margin-top:2px')
  if (provider.distanceKm !== null && provider.distanceKm !== undefined) {
    add('span', `${formatDistance(provider.distanceKm)} away`, 'display:block;color:#6f6256')
  }
  if (onOpenProvider) {
    const link = add(
      'a',
      'View services',
      'display:inline-block;margin-top:6px;color:#b6472a;font-weight:600;cursor:pointer;text-decoration:underline',
    )
    link.setAttribute('role', 'link')
    link.addEventListener('click', (e) => {
      e.preventDefault()
      onOpenProvider(provider)
    })
  }
  return root
}

/**
 * Approved providers pinned at their block centre — the only location that is
 * public before a booking is accepted. Tapping a pin opens the provider page.
 */
export default function ServicesMap({ items, zones = [], origin, radiusKm, originLabel = 'Search centre', onOpenProvider }) {
  const container = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    const map = L.map(container.current, { scrollWheelZoom: false }).setView(FALLBACK_CENTER, 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const points = []

    for (const zone of zones) {
      if (!zone.polygon) continue
      L.polygon(zone.polygon, { color: '#1e3a2f', weight: 2, fillColor: '#1e3a2f', fillOpacity: 0.08, interactive: false }).addTo(layer)
      points.push(...zone.polygon)
    }

    for (const provider of items) {
      if (!provider.block?.center) continue
      const point = [provider.block.center.lat, provider.block.center.lng]
      points.push(point)
      L.marker(point, { icon: pinIcon, title: provider.displayName, bubblingMouseEvents: false })
        .bindPopup(popupFor(provider, onOpenProvider))
        .addTo(layer)
    }

    if (origin) {
      const here = [origin.lat, origin.lng]
      points.push(here)
      L.circleMarker(here, { radius: 8, color: '#fff', weight: 2, fillColor: '#3b5b7c', fillOpacity: 1 })
        .bindTooltip(originLabel)
        .addTo(layer)
      if (radiusKm) {
        const circle = L.circle(here, { radius: radiusKm * 1000, color: '#1e3a2f', weight: 1, fillColor: '#1e3a2f', fillOpacity: 0.06 }).addTo(layer)
        const bounds = circle.getBounds()
        points.push([bounds.getNorth(), bounds.getEast()], [bounds.getSouth(), bounds.getWest()])
      }
    }

    if (points.length === 0) map.setView(FALLBACK_CENTER, 12)
    else if (points.length === 1) map.setView(points[0], 14)
    else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 })
  }, [items, zones, origin, radiusKm, originLabel, onOpenProvider])

  return (
    <div
      ref={container}
      role="region"
      aria-label="Map of service providers"
      className="isolate z-0 h-[460px] w-full overflow-hidden rounded-lg border border-line"
    />
  )
}
