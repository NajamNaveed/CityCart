import { RefreshControl, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing } from '../../theme'
import AppText from './AppText'

// The frame every tab screen sits in: safe areas, page colour, a title, and
// optional scrolling. The bottom edge is left to the tab bar.
export default function Screen({ title, subtitle, scroll = true, children, contentStyle, refreshing, onRefresh }) {
  const header = title ? (
    <View style={{ marginBottom: spacing.lg }}>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      {subtitle ? <AppText variant="small" style={{ marginTop: spacing.xs }}>{subtitle}</AppText> : null}
    </View>
  ) : null

  const padding = { padding: spacing.lg, paddingBottom: spacing.xxl }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[padding, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.clay} colors={[colors.clay]} /> : undefined}
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, padding, contentStyle]}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  )
}
