import { useState } from 'react'
import { Pressable, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import ProductImage from './ProductImage'
import { formatPrice } from '../utils/format'
import { formatDistance } from '../utils/geo'
import { colors, minTouch, radius, spacing } from '../theme'

function OfferRow({ offer, onOpen }) {
  const soldOut = offer.availability === 'OUT_OF_STOCK'
  const detail = [
    offer.nearestKm !== null && offer.nearestKm !== undefined ? `${formatDistance(offer.nearestKm)} away` : '',
    offer.branchCount > 1 ? `${offer.branchCount} shops` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Pressable
      onPress={() => onOpen(offer)}
      accessibilityRole="button"
      accessibilityLabel={`${offer.brandName}, ${formatPrice(offer.price)}${soldOut ? ', sold out' : ''}, open this store's product`}
      style={{ minHeight: minTouch, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm }}
    >
      <View style={{ flex: 1 }}>
        <AppText variant="label">{offer.brandName}</AppText>
        {detail ? <AppText variant="small">{detail}</AppText> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
        {soldOut ? (
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
}

/** One real product with every store in the area that sells it. */
export default function CatalogProductCard({ item, onOpenProduct }) {
  const [open, setOpen] = useState(false)
  const details = [item.manufacturer, item.size?.value ? `${item.size.value} ${item.size.unit}` : ''].filter(Boolean).join(' · ')

  return (
    <View style={{ padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <ProductImage src={item.images?.[0]} name={item.name} width={96} style={{ width: 96, height: 96, borderRadius: radius.md }} />
        <View style={{ flex: 1 }}>
          <AppText variant="heading" numberOfLines={2} style={{ fontSize: 18, lineHeight: 24 }}>
            {item.name}
          </AppText>
          {details ? (
            <AppText variant="small" numberOfLines={1}>
              {details}
            </AppText>
          ) : null}
          <AppText variant="label" style={{ marginTop: spacing.xs }}>
            {item.offerCount > 1 ? 'from ' : ''}
            {formatPrice(item.minPrice)}
            <AppText variant="small">{`  · ${item.offerCount} ${item.offerCount === 1 ? 'store' : 'stores'}`}</AppText>
            {!item.inStock ? <AppText variant="small" style={{ color: colors.danger }}>{'  Sold out'}</AppText> : null}
          </AppText>
        </View>
      </View>

      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ minHeight: 40, justifyContent: 'center', marginTop: spacing.sm }}
      >
        <AppText variant="label" style={{ color: colors.clay }}>
          {open ? 'Hide stores' : item.offerCount > 1 ? `Compare ${item.offerCount} stores` : 'See the store'}
        </AppText>
      </Pressable>

      {open ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line }}>
          {item.offers.map((offer) => (
            <View key={offer.productId} style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
              <OfferRow offer={offer} onOpen={() => onOpenProduct(offer)} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}
