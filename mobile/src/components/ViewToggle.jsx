import { Pressable, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import { colors, radius, spacing } from '../theme'

// A two-way switch between the list and the map, shared by stores and services.
export default function ViewToggle({ view, onChange, options }) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', width: '100%', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface }}>
      {options.map(([value, label, icon]) => (
        <Pressable
          key={value}
          onPress={() => onChange(value)}
          accessibilityRole="radio"
          accessibilityState={{ selected: view === value }}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, paddingHorizontal: spacing.sm, backgroundColor: view === value ? colors.ink : colors.surface }}
        >
          <Feather name={icon} size={15} color={view === value ? colors.white : colors.ink} />
          <AppText variant="label" numberOfLines={1} style={{ color: view === value ? colors.white : colors.ink }}>
            {label}
          </AppText>
        </Pressable>
      ))}
    </View>
  )
}
