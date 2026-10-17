import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import MapView, { Circle, Marker } from 'react-native-maps'
import { colors } from '../theme'
import { formatDistance } from '../utils/geo'

// Faisalabad, used only when there is nothing else to centre on.
const FALLBACK = { latitude: 31.4504, longitude: 73.135, latitudeDelta: 0.12, longitudeDelta: 0.12 }

/**
 * Shop locations as pins, the search centre, and the search radius. `items` are
 * the brands on screen; tapping a pin's label opens that brand's products.
 * Uses the phone's own map (Apple Maps on iPhone, Google Maps on Android).
 */
export default function NearbyMap({ items, origin, radiusKm, originLabel, onOpenBrand }) {
  const mapRef = useRef(null)
  const ready = useRef(false)

  const pins = items.flatMap((brand) => brand.branches.map((branch) => ({ brand, branch })))
  const points = pins.map(({ branch }) => ({ latitude: branch.latitude, longitude: branch.longitude }))
  if (origin) points.push({ latitude: origin.lat, longitude: origin.lng })

  // Frame everything shown. Runs when the map is ready and whenever the results change.
  const signature = points.map((p) => `${p.latitude},${p.longitude}`).join('|') + `|${radiusKm}`
  const frame = () => {
    if (!ready.current || !mapRef.current || points.length === 0) return
    mapRef.current.fitToCoordinates(points, { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: false })
  }
  useEffect(frame, [signature]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View accessibilityLabel="Map of nearby shops" style={{ height: 420, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={FALLBACK}
        onMapReady={() => {
          ready.current = true
          frame()
        }}
        toolbarEnabled={false}
      >
        {radiusKm && origin ? (
          <Circle center={{ latitude: origin.lat, longitude: origin.lng }} radius={radiusKm * 1000} strokeColor={colors.pine} fillColor="rgba(30,58,47,0.08)" strokeWidth={1} />
        ) : null}
        {origin ? <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} title={originLabel} pinColor="#3b5b7c" /> : null}
        {pins.map(({ brand, branch }) => (
          <Marker
            key={`${brand._id}:${branch._id}`}
            coordinate={{ latitude: branch.latitude, longitude: branch.longitude }}
            title={brand.name}
            description={[branch.name, branch.distanceKm != null ? `${formatDistance(branch.distanceKm)} away` : ''].filter(Boolean).join(' · ')}
            pinColor={colors.clay}
            onCalloutPress={() => onOpenBrand(brand)}
          />
        ))}
      </MapView>
    </View>
  )
}
