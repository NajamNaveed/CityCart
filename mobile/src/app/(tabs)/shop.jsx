import { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, View, useWindowDimensions } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Chip from '../../components/ui/Chip'
import EmptyState from '../../components/ui/EmptyState'
import OptionSheet from '../../components/ui/OptionSheet'
import SearchBar from '../../components/ui/SearchBar'
import Skeleton from '../../components/ui/Skeleton'
import CityChip from '../../components/CityChip'
import ProductCard from '../../components/ProductCard'
import { useCity } from '../../hooks/useCity'
import { useDebounced } from '../../hooks/useDebounced'
import { usePagedList } from '../../hooks/usePagedList'
import { useRatings } from '../../hooks/useRatings'
import { useRemote } from '../../hooks/useRemote'
import { fetchBrands, fetchProducts, SORTS } from '../../services/catalog'
import { colors, spacing } from '../../theme'

const text = (value) => (Array.isArray(value) ? value[0] : value) || ''

export default function Shop() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const { cityId } = useCity()
  const params = useLocalSearchParams()
  const qParam = text(params.q)
  const brandParam = text(params.brandId)
  const requestId = text(params.t) // changes with every navigation to this screen (see shopHref)

  const [draft, setDraft] = useState(qParam)
  const [brandId, setBrandId] = useState(brandParam)
  const [sortKey, setSortKey] = useState('newest')
  const [sheet, setSheet] = useState(null) // 'sort' | 'brand' | null

  // This screen stays alive in the tab bar, so a search or brand picked on
  // Home or Brands arrives as new params: take them in, once.
  const [seen, setSeen] = useState({ q: qParam, brandId: brandParam, requestId })
  if (requestId !== seen.requestId || qParam !== seen.q || brandParam !== seen.brandId) {
    setSeen({ q: qParam, brandId: brandParam, requestId })
    setDraft(qParam)
    setBrandId(brandParam)
  }

  const search = useDebounced(draft.trim(), 400)
  const brands = useRemote(`brands:${cityId || 'all'}`, () => fetchBrands(cityId))
  const brandList = brands.data ?? []
  const brandName = Object.fromEntries(brandList.map((b) => [b._id, b.name]))

  const key = JSON.stringify([cityId, search, brandId, sortKey])
  const list = usePagedList(key, (page) => fetchProducts({ search, brandId, sortKey, cityId, page }))
  const ratings = useRatings(list.items)

  const cardWidth = Math.floor((width - spacing.lg * 2 - spacing.md) / 2)
  const filtered = Boolean(search || brandId)
  const clearAll = () => {
    setDraft('')
    setBrandId('')
  }

  const header = (
    <View style={{ paddingBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
        <AppText variant="title">Shop</AppText>
        <CityChip />
      </View>
      <SearchBar value={draft} onChangeText={setDraft} placeholder="Search products…" label="Search products" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
        <Chip icon="sliders" label={SORTS.find((s) => s.key === sortKey).label} onPress={() => setSheet('sort')} accessibilityHint="Change the sort order" />
        <Chip
          icon="tag"
          label={brandId ? brandName[brandId] || 'Brand' : 'All brands'}
          selected={Boolean(brandId)}
          onPress={() => setSheet('brand')}
          onClear={() => setBrandId('')}
          accessibilityHint="Filter by brand"
        />
      </View>
      {!list.loading && !list.error ? (
        <AppText variant="small" style={{ marginTop: spacing.md }} accessibilityLiveRegion="polite">
          {list.total} {list.total === 1 ? 'product' : 'products'}
          {search ? ` for “${search}”` : ''}
        </AppText>
      ) : null}
    </View>
  )

  const empty = list.loading ? (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ width: cardWidth }}>
          <Skeleton height={cardWidth * 1.25} />
          <Skeleton height={14} width="70%" style={{ marginTop: spacing.sm }} />
          <Skeleton height={14} width="40%" style={{ marginTop: spacing.xs }} />
        </View>
      ))}
    </View>
  ) : list.error ? (
    <EmptyState icon="wifi-off" tone="error" title="Couldn't load products" message={list.error} action={<Button title="Try again" onPress={list.refresh} />} />
  ) : (
    <EmptyState
      icon="search"
      title={search ? `Nothing found for “${search}”` : 'No products here yet'}
      message={filtered ? 'Try a shorter search or remove a filter.' : 'Check back soon.'}
      action={filtered ? <Button title="Clear search and filters" variant="outline" onPress={clearAll} /> : undefined}
    />
  )

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <FlatList
        data={list.items}
        keyExtractor={(product) => product._id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.md, marginBottom: spacing.xl }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        refreshing={list.refreshing}
        onRefresh={list.refresh}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.6}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            brandName={brandName[item.brandId]}
            rating={ratings[item._id]}
            width={cardWidth}
            onPress={() => router.push(`/product/${item._id}`)}
          />
        )}
        ListFooterComponent={
          list.loadingMore ? (
            <ActivityIndicator color={colors.clay} style={{ marginVertical: spacing.lg }} />
          ) : list.moreError ? (
            <Pressable onPress={list.loadMore} accessibilityRole="button" style={{ alignItems: 'center', padding: spacing.lg }}>
              <AppText variant="small" style={{ color: colors.danger }}>
                {list.moreError} Tap to try again.
              </AppText>
            </Pressable>
          ) : null
        }
      />

      <OptionSheet
        visible={sheet === 'sort'}
        title="Sort by"
        options={SORTS.map((s) => ({ value: s.key, label: s.label }))}
        selected={sortKey}
        onClose={() => setSheet(null)}
        onSelect={(value) => {
          setSortKey(value)
          setSheet(null)
        }}
      />
      <OptionSheet
        visible={sheet === 'brand'}
        title="Brand"
        options={[{ value: '', label: 'All brands' }, ...brandList.map((b) => ({ value: b._id, label: b.name }))]}
        selected={brandId}
        emptyText="No brands to show."
        onClose={() => setSheet(null)}
        onSelect={(value) => {
          setBrandId(value)
          setSheet(null)
        }}
      />
    </SafeAreaView>
  )
}
