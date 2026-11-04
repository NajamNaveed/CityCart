import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import AppText from './ui/AppText'
import { destinationMapUrl } from '../utils/delivery'
import { colors, radius, spacing } from '../theme'

/**
 * Where to deliver, from the pin the customer chose at checkout (docs/23). The
 * map is a preview inside the delivery: touches pass through to the page and
 * directions are handed to the phone's navigation app by the caller, so there is
 * no second map to pan while the rider scrolls the job.
 */
export default function DestinationMap({ point, label = 'Delivery destination', height = 200 }) {
  const [failed, setFailed] = useState(false)
  const url = destinationMapUrl(point)
  if (!url) return null

  return (
    <View testID="destination-map" accessibilityLabel={`Map of ${label}`} style={[styles.frame, { height }]}>
      {failed ? (
        <View style={styles.overlay}>
          <AppText variant="small" style={{ textAlign: 'center' }}>
            The map could not load. Check your internet connection, or use the directions button.
          </AppText>
        </View>
      ) : (
        <WebView
          source={{ uri: url }}
          style={styles.web}
          onError={() => setFailed(true)}
          pointerEvents="none"
          originWhitelist={['https://*.openstreetmap.org', 'about:blank']}
          setSupportMultipleWindows={false}
          javaScriptEnabled
          domStorageEnabled={false}
          nestedScrollEnabled
          androidLayerType="hardware"
          accessibilityLabel={`Map of ${label}`}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.sand,
  },
  web: { flex: 1, backgroundColor: colors.sand },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.sand,
  },
})
