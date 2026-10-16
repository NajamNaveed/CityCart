import { Pressable, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { colors, radius, spacing } from '../../theme'
import AppText from './AppText'

// A pill that opens a choice (Sort, Brand) or shows one that is active.
export default function Chip({ label, selected = false, icon, onPress, onClear, accessibilityHint }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityHint={accessibilityHint}
        hitSlop={{ top: 4, bottom: 4 }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          minHeight: 40,
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: selected ? colors.ink : colors.line,
          backgroundColor: selected ? colors.ink : colors.surface,
        }}
      >
        {icon ? <Feather name={icon} size={15} color={selected ? colors.white : colors.ink} /> : null}
        <AppText variant="label" numberOfLines={1} style={{ color: selected ? colors.white : colors.ink, maxWidth: 160 }}>
          {label}
        </AppText>
        {selected && onClear ? (
          <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel={`Remove ${label}`} hitSlop={10}>
            <Feather name="x" size={15} color={colors.white} />
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  )
}
