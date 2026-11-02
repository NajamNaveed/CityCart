import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import MapView, { Circle, Marker, Polygon } from 'react-native-maps'
import { colors } from '../theme'
import { formatDistance } from '../utils/geo'

// Faisalabad, used only when there is nothing else to centre on.
const FALLBACK = { latitude: 31.4504, longitude: 73.135, latitudeDelta: 0.12, longitudeDelta: 0.12 }

const ringOf = (block) =>
  (Array.isArray(block.polygon) ? block.polygon : []).map(([latitude, longitude]) => ({ latitude, longitude }))

/**
 * Shop locations as pins, the delivery zones, the search centre (or dropped pin),
 * and the search radius. `items` are the brands on screen; tapping a pin's label
 * opens that brand's products. `onPick` turns a tap on the map into a delivery pin.
 * Uses the phone's own map (Apple Maps on iPhone, Google Maps on Android).
 */
export default function NearbyMap({ items, zones = [], selectedIds = [], origin, pin, radiusKm, originLabel, onOpenBrand, onPick, height = 420 }) {
  const mapRef = useRef(null)
  const ready = useRef(false)

  const pins = (items || []).flatMap((brand) => brand.branches.map((branch) => ({ brand, branch })))
  const points = pins.map(({ branch }) => ({ latitude: branch.latitude, longitude: branch.longitude }))
  for (const zone of zones) points.push(...ringOf(zone))
  const shownPin = pin || origin
  if (shownPin) points.push({ latitude: shownPin.lat, longitude: shownPin.lng })

  // Frame everything shown. Runs when the map is ready and whenever the results change.
  const signature = points.map((p) => `${p.latitude},${p.longitude}`).join('|') + `|${radiusKm}`
  const frame = () => {
    if (!ready.current || !mapRef.current || points.length === 0) return
    mapRef.current.fitToCoordinates(points, { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: false })
  }
  useEffect(frame, [signature]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View accessibilityLabel={onPick ? 'Map for choosing a spot' : 'Map of nearby shops'} style={{ height, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
      <MapView
        ref={mapRef}
        testID="map"
        style={{ flex: 1 }}
        initialRegion={FALLBACK}
        onMapReady={() => {
          ready.current = true
          frame()
        }}
        onPress={onPick ? (event) => onPick(event.nativeEvent.coordinate.latitude, event.nativeEvent.coordinate.longitude) : undefined}
        toolbarEnabled={false}
      >
        {zones.map((zone) => {
          const coordinates = ringOf(zone)
          if (coordinates.length < 3) return null
          const selected = selectedIds.includes(zone._id)
          return (
            <Polygon
              key={zone._id}
              coordinates={coordinates}
              strokeColor={selected ? colors.pine : colors.muted}
              fillColor={selected ? 'rgba(30,58,47,0.10)' : 'rgba(100,116,139,0.06)'}
              strokeWidth={selected ? 2 : 1}
            />
          )
        })}
        {radiusKm && shownPin ? (
          <Circle center={{ latitude: shownPin.lat, longitude: shownPin.lng }} radius={radiusKm * 1000} strokeColor={colors.pine} fillColor="rgba(30,58,47,0.08)" strokeWidth={1} />
        ) : null}
        {shownPin ? <Marker coordinate={{ latitude: shownPin.lat, longitude: shownPin.lng }} title={originLabel || (pin ? 'Delivery spot' : 'Search centre')} pinColor="#3b5b7c" /> : null}
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
