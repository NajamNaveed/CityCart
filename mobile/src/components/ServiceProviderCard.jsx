import { Pressable, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import ProductImage from './ProductImage'
import Stars from './Stars'
import { formatDistance } from '../utils/geo'
import { formatPrice } from '../utils/format'
import { colors, radius, spacing } from '../theme'

/**
 * One provider in the services list: who they are, where they work, what they
 * charge from, and a couple of the jobs they offer. The price is a starting
 * point in paisa, shown in rupees like every other price in the app.
 */
export default function ServiceProviderCard({ provider, onPress }) {
  const category = provider.category?.name
  const block = provider.block?.name
  const where = [category, block].filter(Boolean).join(' · ')
  const distance = provider.distanceKm !== null && provider.distanceKm !== undefined ? formatDistance(provider.distanceKm) : ''
  const price = formatPrice((provider.startingAtPrice || 0) / 100)
  const offerings = provider.topOfferings || []
  const extra = Math.max(0, (provider.offeringCount || 0) - offerings.length)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${provider.displayName}${where ? `, ${where}` : ''}, starting at ${price}`}
      style={({ pressed }) => ({
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: pressed ? colors.sand : colors.surface,
      })}
    >
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <ProductImage
          src={provider.avatar || provider.coverImage}
          name={provider.displayName}
          width={64}
          style={{ width: 64, height: 64, borderRadius: radius.md }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="strong" numberOfLines={1} style={{ fontSize: 17 }}>
            {provider.displayName}
          </AppText>
          {where ? (
            <AppText variant="small" numberOfLines={1} style={{ marginTop: 1 }}>
              {where}
            </AppText>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}>
            {provider.ratingCount > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Stars value={provider.ratingAvg} size={12} />
                <AppText variant="label" style={{ fontSize: 12 }}>
                  {Number(provider.ratingAvg).toFixed(1)} ({provider.ratingCount})
                </AppText>
              </View>
            ) : (
              <AppText variant="label" style={{ fontSize: 12, color: colors.clay }}>
                {provider.isNew ? 'New on CityCart' : 'No reviews yet'}
              </AppText>
            )}
            {distance ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Feather name="map-pin" size={12} color={colors.clay} />
                <AppText variant="small" style={{ fontSize: 12 }}>
                  {distance} away
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="small" style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
            From
          </AppText>
          <AppText variant="strong" style={{ marginTop: 2 }}>
            {price}
          </AppText>
        </View>
      </View>

      {provider.bio ? (
        <AppText variant="small" numberOfLines={2}>
          {provider.bio}
        </AppText>
      ) : null}

      {offerings.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md }}>
          {offerings.map((offering) => (
            <View
              key={offering._id}
              style={{ paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper }}
            >
              <AppText variant="small" style={{ fontSize: 12, color: colors.ink }}>
                {offering.title}
              </AppText>
            </View>
          ))}
          {extra > 0 ? (
            <AppText variant="small" style={{ fontSize: 12 }}>
              +{extra} more
            </AppText>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  )
}
