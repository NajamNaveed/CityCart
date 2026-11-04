import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Faisalabad, used only when nothing else can be centred on.
const FALLBACK_CENTER = [31.4504, 73.135]

// Same CSS teardrop as the shop pins, in the brand green so the customer's own
// address reads differently from the rider's dot.
const destinationIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:26px;height:26px;border-radius:50% 50% 50% 0;background:#1e3a2f;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"><span style="display:block;width:8px;height:8px;margin:7px;border-radius:50%;background:#fff"></span></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  tooltipAnchor: [0, -26],
})

const isPoint = (point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng)

// The customer's address pin and, while the rider shares it, the rider's moving
// dot. The camera fits both once — later positions move only the dot, so the
// map never jumps every time the rider is polled.
export default function DeliveryMap({ destination, rider, height = 220 }) {
  const container = useRef(null)
  const mapRef = useRef(null)
  const destinationRef = useRef(null)
  const riderRef = useRef(null)
  const riderFitted = useRef(false)

  useEffect(() => {
    const map = L.map(container.current, { scrollWheelZoom: false }).setView(FALLBACK_CENTER, 13)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      destinationRef.current = null
      riderRef.current = null
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
      riderFitted.current = false
      return
    }
    const point = [rider.lat, rider.lng]
    if (!riderRef.current) {
      riderRef.current = L.circleMarker(point, { radius: 8, color: '#fff', weight: 2, fillColor: '#b6472a', fillOpacity: 1 })
        .bindTooltip('Your rider')
        .addTo(map)
    } else {
      riderRef.current.setLatLng(point)
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
