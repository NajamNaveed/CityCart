import { FlatList, Linking, Pressable, View } from 'react-native'
import { useState } from 'react'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import { BrandLogo } from './BrandCard'
import ProductImage from './ProductImage'
import { formatPrice } from '../utils/format'
import { formatDistance, mapsUrl } from '../utils/geo'
import { colors, radius, spacing } from '../theme'

function BranchLine({ branch }) {
  const where = [branch.blockName, branch.address].filter(Boolean).join(' · ')
  return (
    <View style={{ paddingVertical: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <AppText variant="label">{branch.name}</AppText>
          {where ? <AppText variant="small">{where}</AppText> : null}
        </View>
        {branch.distanceKm !== null && branch.distanceKm !== undefined ? <AppText variant="small">{formatDistance(branch.distanceKm)}</AppText> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <Pressable
          onPress={() => Linking.openURL(mapsUrl(branch, branch.name))}
          accessibilityRole="link"
          accessibilityLabel={`Directions to ${branch.name}`}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 }}
        >
          <Feather name="navigation" size={14} color={colors.clay} />
          <AppText variant="label" style={{ color: colors.clay }}>
            Directions
          </AppText>
        </Pressable>
        {branch.phone ? (
          <Pressable
            onPress={() => Linking.openURL(`tel:${branch.phone.replace(/[^\d+]/g, '')}`)}
            accessibilityRole="link"
            accessibilityLabel={`Call ${branch.name}`}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 }}
          >
            <Feather name="phone" size={14} color={colors.clay} />
            <AppText variant="label" style={{ color: colors.clay }}>
              Call
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

function ProductTile({ product, onPress }) {
  const soldOut = product.availability === 'OUT_OF_STOCK'
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${formatPrice(product.price)}${soldOut ? ', sold out' : ''}${product.availableAt ? `, only at ${product.availableAt.join(', ')}` : ''}`}
      style={{ width: 120 }}
    >
      <ProductImage src={product.image} name={product.name} width={120} style={{ width: 120, height: 120, borderRadius: radius.md }} />
      <AppText variant="label" numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, marginTop: spacing.xs }}>
        {product.name}
      </AppText>
      <AppText variant="small">
        {formatPrice(product.price)}
        {soldOut ? '  Sold out' : ''}
      </AppText>
      {product.availableAt ? (
        <AppText variant="small" numberOfLines={1} style={{ color: colors.clay, fontSize: 11 }}>
          Only at {product.availableAt.join(', ')}
        </AppText>
      ) : null}
    </Pressable>
  )
}

/** One brand near the shopper: how far, its branches, and a few of its products. */
export default function NearbyBrandCard({ brand, onOpenProduct, onSeeAll }) {
  const [showAll, setShowAll] = useState(false)
  const [first, ...others] = brand.branches
  const branches = showAll ? brand.branches : [first]

  return (
    <View style={{ padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <BrandLogo brand={brand} size={48} />
        <View style={{ flex: 1 }}>
          <AppText variant="heading" numberOfLines={1} style={{ fontSize: 18, lineHeight: 24 }}>
            {brand.name}
          </AppText>
          <AppText variant="small">
            {brand.nearestKm !== null && brand.nearestKm !== undefined ? `${formatDistance(brand.nearestKm)} away · ` : ''}
            {brand.branchCount} {brand.branchCount === 1 ? 'branch' : 'branches'}
          </AppText>
        </View>
      </View>

      <View style={{ marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line }}>
        {branches.map((branch, i) => (
          <View key={branch._id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.line } : undefined}>
            <BranchLine branch={branch} />
          </View>
        ))}
        {others.length > 0 ? (
          <Pressable onPress={() => setShowAll((v) => !v)} accessibilityRole="button" style={{ minHeight: 40, justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.line }}>
            <AppText variant="label" style={{ color: colors.ink }}>
              {showAll ? 'Hide other branches' : `Show ${others.length} more ${others.length === 1 ? 'branch' : 'branches'}`}
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {brand.products.length > 0 ? (
        <FlatList
          horizontal
          data={brand.products}
          keyExtractor={(p) => p._id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.md, paddingTop: spacing.md }}
          style={{ borderTopWidth: 1, borderTopColor: colors.line, marginTop: spacing.xs }}
          renderItem={({ item }) => <ProductTile product={item} onPress={() => onOpenProduct(item)} />}
        />
      ) : null}

      <Pressable onPress={onSeeAll} accessibilityRole="button" hitSlop={8} style={{ marginTop: spacing.md, minHeight: 36, justifyContent: 'center' }}>
        <AppText variant="label" style={{ color: colors.clay }}>
          See all products
        </AppText>
      </Pressable>
    </View>
  )
}
