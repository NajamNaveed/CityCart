import { ActivityIndicator, View } from 'react-native'
import { colors, spacing } from '../../theme'
import AppText from './AppText'

export default function Spinner({ label }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label || 'Loading'}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md }}
    >
      <ActivityIndicator color={colors.pine} />
      {label ? <AppText variant="small">{label}</AppText> : null}
    </View>
  )
}
