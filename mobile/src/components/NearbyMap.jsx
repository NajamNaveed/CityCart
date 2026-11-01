import { useMemo } from 'react'
import MapView, { ZONE_COLORS } from './MapView'
import { formatDistance } from '../utils/geo'

/**
 * Shop locations as pins, the block(s) being searched as outlines, the search centre and the
 * search radius. `items` are the brands on screen; tapping a pin opens a label whose button
 * opens that brand's products.
 */
export default function NearbyMap({ items, zones = [], origin, radiusKm, originLabel, onOpenBrand }) {
  const data = useMemo(
    () => ({
      zones: zones.filter((z) => z.polygon).map((z, i) => ({ name: z.name, polygon: z.polygon, color: ZONE_COLORS[i % ZONE_COLORS.length], selected: true })),
      pins: items.flatMap((brand) =>
        brand.branches.map((branch) => ({
          brandId: String(brand._id),
          lat: branch.latitude,
          lng: branch.longitude,
          title: brand.name,
          sub: [branch.name, branch.distanceKm != null ? `${formatDistance(branch.distanceKm)} away` : ''].filter(Boolean).join(' · '),
        })),
      ),
      origin: origin ? { lat: origin.lat, lng: origin.lng, label: originLabel || 'Search centre' } : null,
      radiusKm: radiusKm || null,
    }),
    [items, zones, origin, originLabel, radiusKm],
  )

  const onMessage = (message) => {
    if (message.type !== 'brand') return
    const brand = items.find((b) => String(b._id) === message.id)
    if (brand) onOpenBrand(brand)
  }

  return <MapView data={data} onMessage={onMessage} label="Map of nearby shops" />
}
