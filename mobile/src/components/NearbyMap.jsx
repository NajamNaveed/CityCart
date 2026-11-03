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
 * tapping a shop pin, then "See products", calls `onOpenBrand(brand)`.
 */
export default function NearbyMap({ items, zones = [], selectedIds = [], origin, pin, radiusKm, originLabel, onOpenBrand, onPick, height = 420 }) {
  const web = useRef(null)
  const brands = useRef(new Map())
  const handlers = useRef({})
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState('')

  useEffect(() => {
    handlers.current = { onPick, onOpenBrand }
  })
  useEffect(() => {
    brands.current = new Map((items || []).map((brand) => [String(brand._id), brand]))
  }, [items])

  const pickable = Boolean(onPick)
  // Refit only when what the map shows changes, not on every parent render.
  const signature = JSON.stringify({ items, zones, selectedIds, origin, pin, radiusKm, originLabel, pickable })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => JSON.stringify(buildMapData({ items, zones, selectedIds, origin, pin, radiusKm, originLabel, pickable })), [signature])

  useEffect(() => {
    if (!ready) return
    web.current?.injectJavaScript(`window.CityCartMap && window.CityCartMap.setData(${data}); true;`)
  }, [ready, data])

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
      const brand = brands.current.get(String(message.brandId))
      if (brand) handlers.current.onOpenBrand?.(brand)
    }
  }

  return (
    <View testID="map" accessibilityLabel={pickable ? 'Map for choosing a spot' : 'Map of nearby shops'} style={[styles.frame, { height }]}>
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
