import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Faisalabad, used only when nothing else can be centred on.
const FALLBACK_CENTER = [31.4504, 73.135]

// Points closer than this are treated as the same spot, so a stationary rider
// does not grow the trail while they wait.
const TRAIL_MIN_METRES = 8

// A new road route is asked for once the rider has moved this far, so a poll
// every fifteen seconds does not hammer the routing service.
const ROUTE_MIN_METRES = 60

// How far the refocus button zooms in on the rider.
const REFOCUS_ZOOM = 16.5

// The public OSRM demo router: free, no key, the same family as the map tiles.
// It is a courtesy service with no SLA; when it cannot answer the map keeps the
// travelled trail and a faint dashed line towards the customer.
const ROUTER_URL = 'https://router.project-osrm.org/route/v1/driving'

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

// A short-lived cache keyed by both ends, rounded to about ten metres. Polling
// often re-asks for the same leg; the answer does not change.
const routeCache = new Map()

function routeCacheKey(from, to) {
  return `${from[0].toFixed(4)},${from[1].toFixed(4)}>${to[0].toFixed(4)},${to[1].toFixed(4)}`
}

async function fetchRoadRoute(from, to, signal) {
  const key = routeCacheKey(from, to)
  const cached = routeCache.get(key)
  if (cached) return cached
  const url =
    `${ROUTER_URL}/${from[1]},${from[0]};${to[1]},${to[0]}` +
    '?overview=full&geometries=geojson&alternatives=false&steps=false'
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error('The router did not answer.')
  const body = await response.json()
  const coordinates = body?.routes?.[0]?.geometry?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error('The router found no road.')
  }
  const points = coordinates.map(([lng, lat]) => [lat, lng])
  if (routeCache.size > 12) routeCache.delete(routeCache.keys().next().value)
  routeCache.set(key, points)
  return points
}

// The customer's address pin and, while the rider shares it, the rider's moving
// badge, the way travelled since this map opened, and the road still ahead of
// them. The camera fits both once — later positions move only the badge, so the
// map never jumps on every poll. The button in the corner brings the rider back
// into view at street zoom.
//
// The server keeps only the last point (docs/11 §30), so the trail lives here
// in the page and is never fetched or sent anywhere. The road route is asked
// for from the public OSRM router and drawn on the device only.
export default function DeliveryMap({ destination, rider, height = 220 }) {
  const container = useRef(null)
  const mapRef = useRef(null)
  const destinationRef = useRef(null)
  const riderRef = useRef(null)
  const routeLayerRef = useRef(null)
  const trailLayerRef = useRef(null)
  const trailRef = useRef([])
  const bearingRef = useRef(null)
  const riderFitted = useRef(false)
  const routeFromRef = useRef(null)
  const routeDestRef = useRef(null)
  const routeRequestRef = useRef(0)
  const routeAbortRef = useRef(null)

  useEffect(() => {
    const map = L.map(container.current, { scrollWheelZoom: false }).setView(FALLBACK_CENTER, 13)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    routeLayerRef.current = L.layerGroup().addTo(map)
    trailLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => {
      routeAbortRef.current?.abort()
      map.remove()
      mapRef.current = null
      destinationRef.current = null
      riderRef.current = null
      routeLayerRef.current = null
      trailLayerRef.current = null
      trailRef.current = []
      bearingRef.current = null
      riderFitted.current = false
      routeFromRef.current = null
      routeDestRef.current = null
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
    const routeLayer = routeLayerRef.current
    if (!isPoint(rider)) {
      if (riderRef.current) {
        riderRef.current.remove()
        riderRef.current = null
      }
      trailRef.current = []
      trailLayerRef.current?.clearLayers()
      routeLayer?.clearLayers()
      routeFromRef.current = null
      routeDestRef.current = null
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

    // The road that is left to ride. Re-asked only when the rider has moved far
    // enough or the customer's pin changed.
    if (isPoint(destination) && routeLayer) {
      const dest = [destination.lat, destination.lng]
      const movedFar =
        !routeFromRef.current || metresBetween(routeFromRef.current, point) >= ROUTE_MIN_METRES
      const destChanged =
        !routeDestRef.current || metresBetween(routeDestRef.current, dest) >= 5
      if (movedFar || destChanged) {
        routeFromRef.current = point
        routeDestRef.current = dest
        const request = ++routeRequestRef.current
        routeAbortRef.current?.abort()
        const controller = new AbortController()
        routeAbortRef.current = controller
        fetchRoadRoute(point, dest, controller.signal)
          .then((points) => {
            if (request !== routeRequestRef.current || !routeLayerRef.current) return
            routeLayerRef.current.clearLayers()
            L.polyline(points, { color: '#ffffff', weight: 7, opacity: 0.85, lineCap: 'round' }).addTo(routeLayerRef.current)
            L.polyline(points, { color: '#1e3a2f', weight: 4.5, opacity: 0.7, lineCap: 'round' }).addTo(routeLayerRef.current)
          })
          .catch((error) => {
            if (error?.name === 'AbortError' || request !== routeRequestRef.current) return
            // No road answer: show the direction as a dashed hint, never as a
            // pretend driving route.
            routeLayerRef.current?.clearLayers()
            L.polyline([point, dest], {
              color: '#7c7265',
              weight: 3,
              opacity: 0.5,
              dashArray: '2 9',
              lineCap: 'round',
            }).addTo(routeLayerRef.current)
          })
      }
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

  const refocus = () => {
    const map = mapRef.current
    const marker = riderRef.current
    if (!map || !marker) return
    map.setView(marker.getLatLng(), REFOCUS_ZOOM, { animate: true })
  }

  return (
    <div className="relative isolate z-0 w-full overflow-hidden rounded-md border border-line" style={{ height }}>
      <div
        ref={container}
        role="region"
        aria-label="Map of your delivery address and rider"
        className="h-full w-full"
      />
      {rider && (
        <button
          type="button"
          onClick={refocus}
          title="Centre the map on your rider"
          aria-label="Centre the map on your rider"
          className="absolute right-3 top-3 z-[500] flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-forest shadow-md transition hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2v3.2M12 18.8V22M2 12h3.2M18.8 12H22" />
          </svg>
        </button>
      )}
    </div>
  )
}
