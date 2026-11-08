import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatDistance } from '../../utils/geo'
import { formatPrice } from '../../ui'

const FALLBACK_CENTER = [31.4504, 73.135]

const pinIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:26px;height:26px;border-radius:50% 50% 50% 0;background:#1c3a2e;transform:rotate(-45deg);border:2px solid #fffcf6;box-shadow:0 1px 5px rgba(21,20,15,.35)"><span style="display:block;width:8px;height:8px;margin:7px;border-radius:50%;background:#fffcf6"></span></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  popupAnchor: [0, -26],
})

// The shopper's own spot, in the colour no provider pin uses.
const chosenPinIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:26px;height:26px;border-radius:50% 50% 50% 0;background:#b6472a;transform:rotate(-45deg);border:2px solid #fffcf6;box-shadow:0 1px 5px rgba(21,20,15,.35)"><span style="display:block;width:8px;height:8px;margin:7px;border-radius:50%;background:#fffcf6"></span></span>',
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
 * With `pickable`, a tap instead sets the shopper's own spot.
 */
export default function ServicesMap({
  items,
  zones = [],
  origin,
  radiusKm,
  originLabel = 'Search centre',
  onOpenProvider,
  pin,
  pickable = false,
  onPick,
  focus = null,
}) {
  const container = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const focusKeyRef = useRef('')
  const pickableRef = useRef(pickable)
  const onPickRef = useRef(onPick)
  useEffect(() => {
    pickableRef.current = pickable
    onPickRef.current = onPick
  })

  useEffect(() => {
    const map = L.map(container.current, { scrollWheelZoom: false }).setView(FALLBACK_CENTER, 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    map.on('click', (e) => {
      if (pickableRef.current) onPickRef.current?.(e.latlng.lat, e.latlng.lng)
    })
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (container.current) container.current.style.cursor = pickable ? 'crosshair' : ''
  }, [pickable])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const points = []

    for (const zone of zones) {
      if (!zone.polygon) continue
      L.polygon(zone.polygon, { color: '#1c3a2e', weight: 2, fillColor: '#1c3a2e', fillOpacity: 0.08, interactive: false }).addTo(layer)
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
      L.circleMarker(here, { radius: 8, color: '#fffcf6', weight: 2, fillColor: '#b6472a', fillOpacity: 1 })
        .bindTooltip(originLabel)
        .addTo(layer)
      if (radiusKm) {
        const circle = L.circle(here, { radius: radiusKm * 1000, color: '#1c3a2e', weight: 1, fillColor: '#1c3a2e', fillOpacity: 0.06 }).addTo(layer)
        const bounds = circle.getBounds()
        points.push([bounds.getNorth(), bounds.getEast()], [bounds.getSouth(), bounds.getWest()])
      }
    }

    if (pin) {
      const spot = [pin.lat, pin.lng]
      points.push(spot)
      L.marker(spot, { icon: chosenPinIcon, title: 'Your chosen spot', bubblingMouseEvents: false })
        .bindTooltip('Your chosen spot')
        .addTo(layer)
    }

    if (points.length === 0) map.setView(FALLBACK_CENTER, 12)
    else if (points.length === 1) map.setView(points[0], 14)
    else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 })
  }, [items, zones, origin, radiusKm, originLabel, onOpenProvider, pin])

  // City picks frame the whole city before the new results narrow it down.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus?.bounds || focusKeyRef.current === focus.key) return
    focusKeyRef.current = focus.key
    const { south, west, north, east } = focus.bounds
    map.fitBounds([[south, west], [north, east]], { padding: [28, 28], maxZoom: 13 })
  }, [focus])

  return (
    <div
      ref={container}
      role="region"
      aria-label={pickable ? 'Map for choosing your location' : 'Map of service providers'}
      className="isolate z-0 h-[460px] w-full overflow-hidden rounded-panel border border-line-warm"
    />
  )
}
