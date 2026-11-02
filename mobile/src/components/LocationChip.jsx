import { Pressable } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import { useCity } from '../hooks/useCity'
import { useNearby } from '../hooks/useNearby'
import { colors, radius, spacing } from '../theme'

// "Gulberg ▾": the area being searched; tapping it opens the location sheet.
export default function LocationChip({ onPress }) {
  const { city } = useCity()
  const { areaName } = useNearby()
  const label = areaName || (city ? city.name : 'Set location')
  const spoken = areaName && city ? `${areaName}, ${city.name}` : label

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Location: ${spoken}. Change`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        minHeight: 40,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.surface,
      }}
    >
      <Feather name="map-pin" size={15} color={colors.clay} />
      <AppText variant="label" numberOfLines={1} style={{ maxWidth: 150 }}>
        {label}
      </AppText>
      <Feather name="chevron-down" size={15} color={colors.muted} />
    </Pressable>
  )
}
