import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Faisalabad, used only when nothing else can be centred on.
const FALLBACK_CENTER = [31.4504, 73.135]

// Points closer than this are treated as the same spot, so a stationary rider
// does not grow the trail while they wait.
const TRAIL_MIN_METRES = 8

// Same CSS teardrop as the shop pins, in the brand green so the customer's own
// address reads differently from the rider's badge.
const destinationIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:26px;height:26px;border-radius:50% 50% 50% 0;background:#1e3a2f;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"><span style="display:block;width:8px;height:8px;margin:7px;border-radius:50%;background:#fff"></span></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  tooltipAnchor: [0, -26],
})

// A clay badge with a moped. When the direction of travel is known the badge,
// and the arrow above it, turn to face the way the rider is going.
function riderIcon(bearing) {
  const turn = bearing == null ? 0 : bearing
  const arrow = bearing == null
    ? ''
    : '<span style="position:absolute;top:-7px;left:50%;width:0;height:0;margin-left:-4px;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:8px solid #b6472a"></span>'
  return L.divIcon({
    className: '',
    html: `<span style="position:relative;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#b6472a;border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4);transform:rotate(${turn}deg)">${arrow}<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5h-4L9 11h5l3 6.5"/><path d="M14 7h3l2 5"/></svg></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    tooltipAnchor: [0, -20],
  })
}

const isPoint = (point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng)

function metresBetween(a, b) {
  const rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad
  const dLng = (b[1] - a[1]) * rad
  const lat = (a[0] * rad + b[0] * rad) / 2
  const x = dLng * Math.cos(lat)
  return 6371000 * Math.hypot(dLat, x)
}

function bearingDegrees(from, to) {
  const rad = Math.PI / 180
  const lat1 = from[0] * rad
  const lat2 = to[0] * rad
  const dLng = (to[1] - from[1]) * rad
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(y, x) / rad + 360) % 360
}

// The customer's address pin and, while the rider shares it, the rider's moving
// badge and the way travelled since this map opened. The camera fits both once —
// later positions move only the badge, so the map never jumps on every poll.
// The server keeps only the last point (docs/11 §30), so the trail lives here
// in the page and is never fetched or sent anywhere.
export default function DeliveryMap({ destination, rider, height = 220 }) {
  const container = useRef(null)
  const mapRef = useRef(null)
  const destinationRef = useRef(null)
  const riderRef = useRef(null)
  const trailLayerRef = useRef(null)
  const trailRef = useRef([])
  const bearingRef = useRef(null)
  const riderFitted = useRef(false)

  useEffect(() => {
    const map = L.map(container.current, { scrollWheelZoom: false }).setView(FALLBACK_CENTER, 13)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    trailLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      destinationRef.current = null
      riderRef.current = null
      trailLayerRef.current = null
      trailRef.current = []
      bearingRef.current = null
      riderFitted.current = false
    }
  }, [])

  // The point picked at checkout.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (destinationRef.current) {
      destinationRef.current.remove()
      destinationRef.current = null
    }
    if (!isPoint(destination)) return
    const point = [destination.lat, destination.lng]
    destinationRef.current = L.marker(point, { icon: destinationIcon, title: 'Delivery address' })
      .bindTooltip('Delivery address')
      .addTo(map)
    if (!riderRef.current) map.setView(point, 15)
  }, [destination])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!isPoint(rider)) {
      if (riderRef.current) {
        riderRef.current.remove()
        riderRef.current = null
      }
      trailRef.current = []
      trailLayerRef.current?.clearLayers()
      bearingRef.current = null
      riderFitted.current = false
      return
    }
    const point = [rider.lat, rider.lng]

    // A new leg of the trail only when the rider has actually moved.
    const trail = trailRef.current
    const last = trail[trail.length - 1]
    if (!last || metresBetween(last, point) >= TRAIL_MIN_METRES) {
      if (last) bearingRef.current = bearingDegrees(last, point)
      trail.push(point)
      if (trail.length > 300) trail.shift()
      trailLayerRef.current?.clearLayers()
      if (trail.length >= 2) {
        L.polyline(trail, { color: '#b6472a', weight: 5, opacity: 0.55, lineCap: 'round' })
          .addTo(trailLayerRef.current)
      }
    }

    const icon = riderIcon(bearingRef.current)
    if (!riderRef.current) {
      riderRef.current = L.marker(point, { icon, title: 'Your rider' })
        .bindTooltip('Your rider')
        .addTo(map)
    } else {
      riderRef.current.setLatLng(point)
      riderRef.current.setIcon(icon)
    }
    // Fit destination and rider together the first time the rider appears.
    if (!riderFitted.current) {
      riderFitted.current = true
      if (isPoint(destination)) {
        map.fitBounds(L.latLngBounds([[destination.lat, destination.lng], point]), { padding: [36, 36], maxZoom: 16 })
      } else {
        map.setView(point, 15)
      }
    }
  }, [rider, destination])

  return (
    <div
      ref={container}
      role="region"
      aria-label="Map of your delivery address and rider"
      className="isolate z-0 w-full overflow-hidden rounded-md border border-line"
      style={{ height }}
    />
  )
}
