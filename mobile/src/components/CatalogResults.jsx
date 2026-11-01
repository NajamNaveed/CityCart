import { useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import AppText from './ui/AppText'
import Button from './ui/Button'
import Card from './ui/Card'
import Chip from './ui/Chip'
import EmptyState from './ui/EmptyState'
import Skeleton from './ui/Skeleton'
import ProductImage from './ProductImage'
import { usePagedList } from '../hooks/usePagedList'
import { browseQuery, fetchCatalogBrowse } from '../services/nearby'
import { formatDistance } from '../utils/geo'
import { formatPrice } from '../utils/format'
import { colors, spacing } from '../theme'

const SORTS = [
  ['name', 'Name'],
  ['price', 'Lowest price'],
  ['nearest', 'Nearest store'],
]

function Offer({ offer, onOpen }) {
  const soldOut = offer.availability === 'OUT_OF_STOCK'
  const detail = [offer.nearestKm != null ? `${formatDistance(offer.nearestKm)} away` : '', offer.branchCount > 1 ? `${offer.branchCount} shops` : ''].filter(Boolean).join(' · ')
  return (
    <Pressable onPress={onOpen} accessibilityRole="link" accessibilityLabel={`${offer.brandName}, ${formatPrice(offer.price)}${soldOut ? ', sold out' : ''}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm, minHeight: 44, alignItems: 'center' }}>
      <View style={{ flex: 1 }}>
        <AppText variant="label">{offer.brandName}</AppText>
        {detail ? <AppText variant="small">{detail}</AppText> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <AppText variant="strong">{formatPrice(offer.price)}</AppText>
        {soldOut ? (
          <AppText variant="small" style={{ color: colors.danger }}>
            Sold out
          </AppText>
        ) : null}
      </View>
    </Pressable>
  )
}

/** One real product with every store that sells it in the shopper's area. */
function ProductCard({ item, onOpenOffer }) {
  const [open, setOpen] = useState(false)
  const details = [item.manufacturer, item.size?.value ? `${item.size.value} ${item.size.unit}` : ''].filter(Boolean).join(' · ')
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <ProductImage src={item.images?.[0]} name={item.name} width={160} style={{ width: 72, height: 72, borderRadius: 8 }} />
        <View style={{ flex: 1 }}>
          <AppText variant="strong" numberOfLines={2}>
            {item.name}
          </AppText>
          {details ? <AppText variant="small">{details}</AppText> : null}
          <AppText variant="label">
            {item.offerCount > 1 ? 'from ' : ''}
            {formatPrice(item.minPrice)}
            <AppText variant="small">{`  ·  ${item.offerCount} ${item.offerCount === 1 ? 'store' : 'stores'}`}</AppText>
            {!item.inStock ? <AppText variant="small" style={{ color: colors.danger }}>{'  Sold out'}</AppText> : null}
          </AppText>
        </View>
      </View>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={8}>
        <AppText variant="label" style={{ color: colors.clay }}>
          {open ? 'Hide stores' : item.offerCount > 1 ? `Compare ${item.offerCount} stores` : 'See the store'}
        </AppText>
      </Pressable>
      {open ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line }}>
          {item.offers.map((o) => (
            <Offer key={o.productId} offer={o} onOpen={() => onOpenOffer(o)} />
          ))}
        </View>
      ) : null}
    </Card>
  )
}

/**
 * The shared catalogue in the shopper's area, each product once with its offers.
 * Rendered inside the Nearby screen's list, so it brings its own header controls and footer.
 */
export default function CatalogResults({ blockIds, origin, range, q }) {
  const router = useRouter()
  const [sort, setSort] = useState('name')
  const effectiveSort = sort === 'nearest' && !origin ? 'name' : sort
  const query = browseQuery({ blockIds, origin, range, q, sort: effectiveSort })
  const list = usePagedList(JSON.stringify(query), (page) => fetchCatalogBrowse({ ...query, page }))

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} accessibilityRole="radiogroup" accessibilityLabel="Sort products">
        {SORTS.filter(([value]) => value !== 'nearest' || origin).map(([value, label]) => (
          <Chip key={value} label={label} selected={effectiveSort === value} onPress={() => setSort(value)} />
        ))}
      </View>
      {list.loading ? (
        <View style={{ gap: spacing.md }}>
          {[0, 1].map((i) => (
            <Skeleton key={i} height={120} />
          ))}
        </View>
      ) : list.error ? (
        <EmptyState icon="wifi-off" tone="error" title="Couldn't load products" message={list.error} action={<Button title="Try again" onPress={list.refresh} />} />
      ) : list.items.length === 0 ? (
        <EmptyState icon="package" title={q ? `No products for “${q}” in your area` : 'No products in your area yet'} message="Try a wider range, another block, or a different search." />
      ) : (
        <>
          <AppText variant="small" accessibilityLiveRegion="polite">
            {list.total} {list.total === 1 ? 'product' : 'products'} in your area
          </AppText>
          {list.items.map((item) => (
            <ProductCard key={item.catalogProductId} item={item} onOpenOffer={(offer) => router.push(`/product/${offer.productId}`)} />
          ))}
          {list.hasMore ? <Button title="Load more products" variant="outline" onPress={list.loadMore} loading={list.loadingMore} /> : null}
          {list.moreError ? (
            <AppText variant="small" style={{ color: colors.danger }}>
              {list.moreError}
            </AppText>
          ) : null}
        </>
      )}
      {list.loadingMore ? <ActivityIndicator color={colors.clay} /> : null}
    </View>
  )
}
