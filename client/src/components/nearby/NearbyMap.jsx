import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatDistance } from '../../utils/geo'

// Faisalabad, used only when there is nothing else to centre on.
const FALLBACK_CENTER = [31.4504, 73.135]

// A teardrop pin drawn with CSS, so there are no image files to bundle
// (Leaflet's default marker images break under Vite).
const pinIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:26px;height:26px;border-radius:50% 50% 50% 0;background:#b6472a;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"><span style="display:block;width:8px;height:8px;margin:7px;border-radius:50%;background:#fff"></span></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  popupAnchor: [0, -26],
})

// Popup content is built with DOM nodes and textContent, never HTML strings,
// so a brand or branch name can never inject markup.
function popupFor(brand, branch, onOpenBrand) {
  const root = document.createElement('div')
  root.style.cssText = 'min-width:160px;font:13px/1.4 system-ui,sans-serif'
  const add = (tag, text, css) => {
    const el = document.createElement(tag)
    el.textContent = text
    if (css) el.style.cssText = css
    root.appendChild(el)
    return el
  }
  add('strong', brand.name, 'display:block;font-size:14px')
  add('span', branch.name, 'display:block')
  const where = [branch.blockName, branch.address].filter(Boolean).join(' · ')
  if (where) add('span', where, 'display:block;color:#6f6256')
  if (branch.distanceKm !== null) add('span', `${formatDistance(branch.distanceKm)} away`, 'display:block;color:#6f6256')
  const link = add('a', 'See products', 'display:inline-block;margin-top:6px;color:#b6472a;font-weight:600;cursor:pointer;text-decoration:underline')
  link.setAttribute('role', 'link')
  link.addEventListener('click', (e) => {
    e.preventDefault()
    onOpenBrand(brand)
  })
  return root
}

// Shop locations as pins, the shopper's own position, and the search radius.
export default function NearbyMap({ items, origin, radiusKm, onOpenBrand }) {
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

    for (const brand of items) {
      for (const branch of brand.branches) {
        const point = [branch.latitude, branch.longitude]
        points.push(point)
        L.marker(point, { icon: pinIcon, title: `${brand.name}: ${branch.name}` })
          .bindPopup(popupFor(brand, branch, onOpenBrand))
          .addTo(layer)
      }
    }

    if (origin) {
      const here = [origin.lat, origin.lng]
      L.circleMarker(here, { radius: 8, color: '#fff', weight: 2, fillColor: '#3b5b7c', fillOpacity: 1 }).bindTooltip('You are here').addTo(layer)
      if (radiusKm) {
        const circle = L.circle(here, { radius: radiusKm * 1000, color: '#1e3a2f', weight: 1, fillColor: '#1e3a2f', fillOpacity: 0.06 }).addTo(layer)
        const bounds = circle.getBounds()
        points.push([bounds.getNorth(), bounds.getEast()], [bounds.getSouth(), bounds.getWest()])
      } else {
        points.push(here)
      }
    }

    if (points.length === 0) map.setView(FALLBACK_CENTER, 12)
    else if (points.length === 1) map.setView(points[0], 15)
    else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 })
  }, [items, origin, radiusKm, onOpenBrand])

  return <div ref={container} role="region" aria-label="Map of nearby shops" className="isolate z-0 h-[460px] w-full overflow-hidden rounded-lg border border-line" />
}
