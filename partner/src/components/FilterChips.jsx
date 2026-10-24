import { Pressable, ScrollView } from 'react-native'
import AppText from './ui/AppText'
import { colors, radius, spacing, weights } from '../theme'

// A row of filters that scrolls sideways. `options` is [[value, label], ...].
export default function FilterChips({ options, value, onChange }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
      {options.map(([optionValue, label]) => {
        const selected = optionValue === value
        return (
          <Pressable
            key={label}
            onPress={() => onChange(optionValue)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{ minHeight: 44, paddingHorizontal: spacing.lg, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: selected ? colors.pine : colors.line, backgroundColor: selected ? colors.pine : colors.surface }}
          >
            <AppText variant="label" style={{ color: selected ? colors.white : colors.ink, fontWeight: weights.medium }}>
              {label}
            </AppText>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}
