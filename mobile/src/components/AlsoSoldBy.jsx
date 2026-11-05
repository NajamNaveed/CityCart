import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import Button from './ui/Button'
import Spinner from './ui/Spinner'
import { useNearby } from '../hooks/useNearby'
import { useRemote } from '../hooks/useRemote'
import { fetchCatalogOffers } from '../services/catalog'
import { areaParams } from '../services/nearby'
import { formatDistance } from '../utils/geo'
import { formatPrice } from '../utils/format'
import { nearbyHref } from '../utils/nav'
import { colors, radius, spacing } from '../theme'

/**
 * The same catalogue product at other stores in the shopper's area. Area-only on
 * purpose: offers from farther shops would send a shopper somewhere they cannot
 * visit or order from. Without an area we ask for one; when nobody in the area
 * sells it, we say so.
 */
export default function AlsoSoldBy({ catalogProductId, currentProductId }) {
  const router = useRouter()
  const { blockIds, origin, range } = useNearby()
  const area = blockIds.length > 0 ? areaParams({ blockIds, coords: origin, range }) : null
  const result = useRemote(`offers:${catalogProductId}:${JSON.stringify(area)}`, () =>
    catalogProductId && area ? fetchCatalogOffers(catalogProductId, area) : Promise.resolve(null),
  )

  if (!catalogProductId) return null

  const title = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
      <AppText variant="small" style={{ textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 11 }}>
        Also sold by
      </AppText>
      <Pressable
        onPress={() => router.navigate(nearbyHref({ view: 'map' }))}
        accessibilityRole="button"
        hitSlop={8}
        style={{ minHeight: 36, justifyContent: 'center' }}
      >
        <AppText variant="small" style={{ color: colors.clay }}>
          Change area
        </AppText>
      </Pressable>
    </View>
  )

  if (!area) {
    return (
      <View style={{ marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.lg, gap: spacing.sm }}>
        {title}
        <AppText variant="small">Choose your area to see the other stores that sell this product.</AppText>
        <Button title="Choose area" variant="outline" onPress={() => router.navigate(nearbyHref({ view: 'map' }))} />
      </View>
    )
  }

  if (result.status === 'loading') {
    return (
      <View style={{ marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.lg, gap: spacing.sm }}>
        {title}
        <Spinner label="Looking for other stores…" />
      </View>
    )
  }

  if (result.status === 'error') {
    return (
      <View style={{ marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.lg, gap: spacing.sm }}>
        {title}
        {result.httpStatus === 404 ? (
          <AppText variant="small">This product isn’t sold by any store in your area.</AppText>
        ) : (
          <>
            <AppText variant="small" style={{ color: colors.clay }}>
              {result.error || 'Other stores could not be loaded.'}
            </AppText>
            <Button title="Try again" variant="outline" onPress={result.reload} />
          </>
        )}
      </View>
    )
  }

  const offers = (result.data?.item?.offers || []).filter((offer) => String(offer.productId) !== String(currentProductId))
  if (!result.data?.item) return null

  return (
    <View style={{ marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.lg, gap: spacing.sm }}>
      {title}
      {offers.length === 0 ? (
        <AppText variant="small">Only sold at this store in your area.</AppText>
      ) : (
        <>
          <AppText variant="small">The same product at other stores in your area.</AppText>
          <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden' }}>
            {offers.map((offer, index) => {
              const detail = [
                offer.nearestKm !== null && offer.nearestKm !== undefined ? `${formatDistance(offer.nearestKm)} away` : '',
                offer.branchCount > 1 ? `${offer.branchCount} shops` : '',
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <Pressable
                  key={offer.productId}
                  onPress={() => router.push(`/product/${offer.productId}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${offer.brandName}, ${formatPrice(offer.price)}${offer.availability === 'OUT_OF_STOCK' ? ', sold out' : ''}`}
                  style={{
                    minHeight: 56,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: spacing.md,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    backgroundColor: colors.surface,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.line,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">{offer.brandName}</AppText>
                    {detail ? <AppText variant="small">{detail}</AppText> : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
                    {offer.availability === 'OUT_OF_STOCK' ? (
                      <AppText variant="small" style={{ color: colors.danger }}>
                        Sold out
                      </AppText>
                    ) : null}
                    {offer.compareAtPrice > offer.price ? (
                      <AppText variant="small" style={{ textDecorationLine: 'line-through' }}>
                        {formatPrice(offer.compareAtPrice)}
                      </AppText>
                    ) : null}
                    <AppText variant="strong">{formatPrice(offer.price)}</AppText>
                    <Feather name="chevron-right" size={18} color={colors.muted} />
                  </View>
                </Pressable>
              )
            })}
          </View>
        </>
      )}
    </View>
  )
}
