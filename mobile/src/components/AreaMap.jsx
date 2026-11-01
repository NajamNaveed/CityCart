import { useMemo } from 'react'
import MapView, { ZONE_COLORS } from './MapView'

/**
 * The city's blocks as zones, with the ones the shopper chose filled in. Tapping the map drops
 * a pin and calls `onPick(lat, lng)`: used to shop, or deliver, somewhere other than where the
 * shopper is standing.
 */
export default function AreaMap({ zones, selectedIds = [], pin = null, onPick, height = 300, label = 'Map of delivery areas' }) {
  const data = useMemo(
    () => ({
      zones: zones.filter((z) => z.polygon).map((z, i) => ({ name: z.name, polygon: z.polygon, color: ZONE_COLORS[i % ZONE_COLORS.length], selected: selectedIds.includes(z._id) })),
      pin,
      pickable: true,
      fitOnce: true,
    }),
    [zones, selectedIds, pin],
  )
  const onMessage = (message) => {
    if (message.type === 'pick') onPick?.(message.lat, message.lng)
  }
  return <MapView data={data} onMessage={onMessage} label={label} height={height} />
}
