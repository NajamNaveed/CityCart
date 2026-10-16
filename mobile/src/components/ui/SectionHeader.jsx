import { Pressable, View } from 'react-native'
import { colors, spacing } from '../../theme'
import AppText from './AppText'

export default function SectionHeader({ title, actionLabel, onAction }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: spacing.md }}>
      <AppText variant="heading" accessibilityRole="header">
        {title}
      </AppText>
      {actionLabel ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={10}>
          <AppText variant="label" style={{ color: colors.clay }}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  )
}
