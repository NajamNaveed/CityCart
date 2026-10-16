import { Image, Pressable, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import { monogram } from '../utils/product'
import { colors, radius, spacing } from '../theme'

export function BrandLogo({ brand, size = 56 }) {
  const frame = { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }
  return (
    <View style={frame}>
      {brand.logo ? (
        <Image source={{ uri: brand.logo }} accessibilityLabel={brand.name} resizeMode="contain" style={{ width: size * 0.7, height: size * 0.7 }} />
      ) : (
        <AppText variant="heading" style={{ fontSize: size * 0.36, color: colors.clay }}>
          {monogram(brand.name)}
        </AppText>
      )}
    </View>
  )
}

// A brand as a full-width row (the Brands screen).
export default function BrandCard({ brand, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${brand.name}. See products`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: pressed ? colors.sand : colors.surface,
      })}
    >
      <BrandLogo brand={brand} />
      <View style={{ flex: 1 }}>
        <AppText variant="strong" numberOfLines={1}>
          {brand.name}
        </AppText>
        {brand.description ? (
          <AppText variant="small" numberOfLines={2}>
            {brand.description}
          </AppText>
        ) : null}
      </View>
      <Feather name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  )
}
