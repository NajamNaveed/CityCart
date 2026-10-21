import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { colors, spacing } from '../theme'

// Sits over the top of whatever screen is showing; screens keep their own
// insets, so this overlaps the screen header only while the device is offline.
export default function OfflineBanner() {
  const offline = useNetworkStatus()
  const insets = useSafeAreaInsets()
  if (!offline) return null

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel="No internet connection"
      style={{
        position: 'absolute',
        top: insets.top,
        left: 0,
        right: 0,
        zIndex: 50,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.ink,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
      }}
    >
      <Feather name="wifi-off" size={14} color={colors.white} />
      <AppText variant="small" style={{ color: colors.white }}>
        No internet connection
      </AppText>
    </View>
  )
}
