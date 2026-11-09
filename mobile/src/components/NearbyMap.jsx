import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import AppText from './ui/AppText'
import { buildMapData } from './map/mapData'
import { MAP_HTML } from './map/mapHtml'
import { colors, radius, spacing } from '../theme'

const ALLOWED = /^(about:|data:|blob:)/

/**
 * OpenStreetMap viewer for the shopper app. Raster tiles come straight from
 * OpenStreetMap, so there is no Google Maps key and no native map SDK; the
 * drawing and gestures run in a WebView. Taps on the map call `onPick(lat, lng)`;
 * tapping a shop pin, then "See products", calls `onOpenBrand(brand)`; a
 * provider pin calls `onOpenProvider(provider)`.
 *
 * `rider` ({ lat, lng }) is a live position: it moves its dot without moving the
 * camera, so an order page can follow the rider without snapping away. `focus`
 * ({ key, bounds }) frames a city; `recenter` (a changing number) re-fits the data.
 */
export default function NearbyMap({ items, providers = [], zones = [], selectedIds = [], origin, pin, rider, radiusKm, originLabel, onOpenBrand, onOpenProvider, onPick, pickable = Boolean(onPick), focus = null, recenter, height = 420 }) {
  const web = useRef(null)
  const brands = useRef(new Map())
  const providerMap = useRef(new Map())
  const handlers = useRef({})
  const focusSeen = useRef('')
  const recenterSeen = useRef(recenter)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState('')

  useEffect(() => {
    handlers.current = { onPick, onOpenBrand, onOpenProvider }
  })
  useEffect(() => {
    brands.current = new Map((items || []).map((brand) => [String(brand._id), brand]))
  }, [items])
  useEffect(() => {
    providerMap.current = new Map((providers || []).map((provider) => [String(provider._id), provider]))
  }, [providers])

  // Taps only count while the map is in choosing mode, even if a handler is passed.
  const canPick = Boolean(pickable && onPick)
  // Refit only when what the map shows changes, not on every parent render.
  const signature = JSON.stringify({ items, providers, zones, selectedIds, origin, pin, radiusKm, originLabel, canPick })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => JSON.stringify(buildMapData({ items, providers, zones, selectedIds, origin, pin, radiusKm, originLabel, pickable: canPick })), [signature])

  useEffect(() => {
    if (!ready) return
    web.current?.injectJavaScript(`window.CityCartMap && window.CityCartMap.setData(${data}); true;`)
  }, [ready, data])

  // A city choice frames the whole city; the results that arrive afterwards may
  // zoom in, but the city itself stays on screen first.
  useEffect(() => {
    if (!ready || !focus?.key || !focus?.bounds || focusSeen.current === focus.key) return
    focusSeen.current = focus.key
    web.current?.injectJavaScript(`window.CityCartMap && window.CityCartMap.setFocus(${JSON.stringify(focus.bounds)}); true;`)
  }, [ready, focus])

  const recenterKey = recenter == null ? null : Number(recenter)
  useEffect(() => {
    if (!ready || recenterKey == null || recenterSeen.current === recenterKey) return
    recenterSeen.current = recenterKey
    web.current?.injectJavaScript('window.CityCartMap && window.CityCartMap.recenter(); true;')
  }, [ready, recenterKey])

  // A shared rider position changes every few seconds; `setRider` moves the dot
  // only, so the customer's pan and zoom stay put. `null, null` takes it away.
  const riderLat = rider ? Number(rider.lat) : NaN
  const riderLng = rider ? Number(rider.lng) : NaN
  const riderKey = Number.isFinite(riderLat) && Number.isFinite(riderLng) ? `${riderLat},${riderLng}` : ''
  useEffect(() => {
    if (!ready) return
    web.current?.injectJavaScript(`window.CityCartMap && window.CityCartMap.setRider(${riderKey || 'null, null'}); true;`)
  }, [ready, riderKey])

  function onMessage(event) {
    let message
    try {
      message = JSON.parse(event.nativeEvent.data)
    } catch {
      return
    }
    if (message.type === 'ready') {
      setReady(true)
      return
    }
    if (message.type === 'pick') handlers.current.onPick?.(message.lat, message.lng)
    if (message.type === 'open') {
      if (message.targetKind === 'provider') {
        const provider = providerMap.current.get(String(message.targetId))
        if (provider) handlers.current.onOpenProvider?.(provider)
        return
      }
      const brand = brands.current.get(String(message.targetId))
      if (brand) handlers.current.onOpenBrand?.(brand)
    }
  }

  const label = canPick
    ? 'Map for choosing a spot'
    : rider
      ? 'Map of your delivery and rider'
      : providers.length > 0
        ? 'Map of local service providers'
        : 'Map of nearby shops'

  return (
    <View testID="map" accessibilityLabel={label} style={[styles.frame, { height }]}>
      <WebView
        ref={web}
        source={{ html: MAP_HTML }}
        originWhitelist={['*']}
        onMessage={onMessage}
        onError={() => setFailed('The map could not load. Check your connection and try again.')}
        onShouldStartLoadWithRequest={(request) => {
          if (ALLOWED.test(request.url)) return true
          Linking.openURL(request.url).catch(() => {})
          return false
        }}
        javaScriptEnabled
        domStorageEnabled={false}
        setSupportMultipleWindows={false}
        // The map pans by transforming one layer, so it needs the GPU path and
        // must win touch negotiation inside the scrolling Nearby screen.
        androidLayerType="hardware"
        nestedScrollEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        mixedContentMode="never"
        style={{ flex: 1, backgroundColor: colors.paper }}
      />
      {!ready && !failed ? (
        <View pointerEvents="none" style={styles.overlay}>
          <ActivityIndicator color={colors.clay} />
          <AppText variant="small">Loading map…</AppText>
        </View>
      ) : null}
      {failed ? (
        <View style={styles.overlay}>
          <AppText variant="small" style={{ color: colors.danger, textAlign: 'center' }}>
            {failed}
          </AppText>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: 'rgba(250,247,242,0.9)',
  },
})
