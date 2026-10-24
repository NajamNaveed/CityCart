import { Pressable, View } from 'react-native'
import AppText from './ui/AppText'
import { colors, radius, spacing } from '../theme'

// One tappable row of a list: a title, a line or two under it, something on the
// right (a price, a time) and an optional pill (a status).
export default function ListRow({ title, subtitle, right, rightSub, pill, onPress, accessibilityLabel }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || [title, subtitle, right].filter(Boolean).join(', ')}
      style={({ pressed }) => ({ padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: pressed ? colors.sand : colors.surface, gap: spacing.sm })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="strong" numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </AppText>
        {pill}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          {subtitle ? (
            <AppText variant="small" numberOfLines={2}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {right ? <AppText variant="label">{right}</AppText> : null}
          {rightSub ? <AppText variant="small">{rightSub}</AppText> : null}
        </View>
      </View>
    </Pressable>
  )
}
