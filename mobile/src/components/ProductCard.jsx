import { Pressable, View } from 'react-native'
import AppText from './ui/AppText'
import ProductImage from './ProductImage'
import Stars from './Stars'
import { availabilityInfo, discountPercent } from '../utils/product'
import { formatPrice } from '../utils/format'
import { colors, radius, spacing } from '../theme'

function Badge({ text, background }) {
  return (
    <View style={{ position: 'absolute', top: spacing.sm, left: spacing.sm, backgroundColor: background, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
      <AppText variant="small" style={{ color: colors.white, fontSize: 11, lineHeight: 14, fontFamily: 'Poppins_600SemiBold', textTransform: 'uppercase' }}>
        {text}
      </AppText>
    </View>
  )
}

// One product in a two-column grid. `width` is the card's width on screen.
export default function ProductCard({ product, brandName, rating, width, onPress }) {
  const stock = availabilityInfo(product)
  const discount = discountPercent(product)
  const spoken = [product.name, formatPrice(product.price), discount && !stock.soldOut ? `${discount}% off` : '', stock.soldOut ? 'sold out' : '']
    .filter(Boolean)
    .join(', ')

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={spoken} style={{ width }}>
      <View>
        <ProductImage src={product.images?.[0]} name={product.name} width={width} style={{ width, aspectRatio: 4 / 5, borderRadius: radius.lg }} />
        {stock.soldOut ? <Badge text="Sold out" background={colors.ink} /> : discount > 0 ? <Badge text={`${discount}% off`} background={colors.clay} /> : null}
      </View>
      <View style={{ marginTop: spacing.sm }}>
        {brandName ? (
          <AppText variant="small" numberOfLines={1} style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
            {brandName}
          </AppText>
        ) : null}
        <AppText variant="label" numberOfLines={2} style={{ fontSize: 14, lineHeight: 19, marginTop: 2 }}>
          {product.name}
        </AppText>
        {rating && rating.count > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 4 }}>
            <Stars value={rating.average} size={12} />
            <AppText variant="small" style={{ fontSize: 12 }}>
              {rating.average.toFixed(1)} ({rating.count})
            </AppText>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: 4 }}>
          <AppText variant="strong">{formatPrice(product.price)}</AppText>
          {discount > 0 ? (
            <AppText variant="small" style={{ textDecorationLine: 'line-through' }}>
              {formatPrice(product.compareAtPrice)}
            </AppText>
          ) : null}
        </View>
        {stock.tone === 'warn' ? (
          <AppText variant="small" style={{ color: colors.clay, marginTop: 2 }}>
            {stock.label}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  )
}
