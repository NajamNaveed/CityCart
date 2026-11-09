import { Pressable, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import { BrandLogo } from './BrandCard'
import ProductImage from './ProductImage'
import { formatDistance } from '../utils/geo'
import { formatPrice } from '../utils/format'
import { colors, radius, spacing } from '../theme'

function lowestPrice(products) {
  return products.reduce((lowest, product) => (lowest === null || product.price < lowest ? product.price : lowest), null)
}

/** A shop on the home feed, with its cover, where it is and what it sells. */
export default function StoreCard({ store, inBlock = false, width, onPress }) {
  const products = Array.isArray(store.products) ? store.products : []
  const branches = Array.isArray(store.branches) ? store.branches : []
  const cover = products.find((product) => product.image)?.image || store.logo
  const from = lowestPrice(products)
  const blockNames = [...new Set(branches.map((branch) => branch.blockName).filter(Boolean))]
  const where = formatDistance(store.nearestKm) || blockNames[0] || 'Nearby'
  const popular = products.slice(0, 3).map((product) => product.name)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${store.name}, ${where}, ${store.branchCount} ${store.branchCount === 1 ? 'branch' : 'branches'}${inBlock ? ', in your block' : ''}`}
      style={({ pressed }) => ({
        width,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: pressed ? colors.sand : colors.surface,
        overflow: 'hidden',
      })}
    >
      <View>
        <ProductImage src={cover} name={store.name} width={width} style={{ width, aspectRatio: 4 / 3 }} />
        <View style={{ position: 'absolute', left: spacing.sm, top: spacing.sm, backgroundColor: 'rgba(253,245,237,0.92)', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
          <AppText variant="small" style={{ color: colors.ink, fontSize: 11, lineHeight: 15 }}>
            {where}
          </AppText>
        </View>
        {inBlock ? (
          <View style={{ position: 'absolute', right: spacing.sm, top: spacing.sm, backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
            <AppText variant="small" style={{ color: colors.white, fontSize: 10, lineHeight: 14, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              Your block
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={{ padding: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <BrandLogo brand={store} size={38} />
          <View style={{ flex: 1 }}>
            <AppText variant="heading" numberOfLines={1} style={{ fontSize: 17, lineHeight: 22 }}>
              {store.name}
            </AppText>
            <AppText variant="small" numberOfLines={1} style={{ fontSize: 12 }}>
              {blockNames.length > 0 ? blockNames.slice(0, 2).join(' · ') : 'Local shop'} · {store.branchCount} {store.branchCount === 1 ? 'branch' : 'branches'}
            </AppText>
          </View>
        </View>

        {popular.length > 0 ? (
          <AppText variant="small" numberOfLines={2} style={{ marginTop: spacing.sm, fontSize: 12, lineHeight: 17, color: colors.muted }}>
            <AppText variant="small" style={{ color: colors.ink, fontSize: 12, lineHeight: 17 }}>
              Popular here:
            </AppText>{' '}
            {popular.join(', ')}
          </AppText>
        ) : null}

        <View style={{ marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <AppText variant="small" style={{ fontSize: 10, lineHeight: 13, letterSpacing: 0.8, textTransform: 'uppercase' }}>
              From
            </AppText>
            <AppText variant="strong" numberOfLines={1} style={{ fontSize: 14 }}>
              {from === null ? 'Ask in shop' : formatPrice(from)}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: spacing.sm, minHeight: 30 }}>
            <AppText variant="label" style={{ fontSize: 11 }}>
              Visit
            </AppText>
            <Feather name="arrow-up-right" size={12} color={colors.ink} />
          </View>
        </View>
      </View>
    </Pressable>
  )
}
