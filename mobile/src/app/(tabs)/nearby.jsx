import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Chip from '../../components/ui/Chip'
import EmptyState from '../../components/ui/EmptyState'
import SearchBar from '../../components/ui/SearchBar'
import Skeleton from '../../components/ui/Skeleton'
import CatalogProductCard from '../../components/CatalogProductCard'
import LocationChip from '../../components/LocationChip'
import NearbyBrandCard from '../../components/NearbyBrandCard'
import NearbyMap from '../../components/NearbyMap'
import RangeBar from '../../components/RangeBar'
import { useCity } from '../../hooks/useCity'
import { useDebounced } from '../../hooks/useDebounced'
import { useNearby } from '../../hooks/useNearby'
import { usePagedList } from '../../hooks/usePagedList'
import { CATALOG_SORTS, catalogQuery, fetchCatalogBrowse } from '../../services/catalog'
import { discoverQuery, fetchDiscover, needsArea } from '../../services/nearby'
import { shopHref } from '../../utils/nav'
import { nextRange, rangeLabel } from '../../utils/range'
import { colors, radius, spacing } from '../../theme'

const NOTHING = { items: [], pagination: { page: 1, pages: 0, total: 0 } }

const VIEWS = [
  ['shops', 'Shops', 'list'],
  ['map', 'Map', 'map'],
  ['products', 'Products', 'package'],
]

function ViewToggle({ view, onChange }) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface }}>
      {VIEWS.map(([value, label, icon]) => (
        <Pressable
          key={value}
          onPress={() => onChange(value)}
          accessibilityRole="radio"
          accessibilityState={{ selected: view === value }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: spacing.md, backgroundColor: view === value ? colors.ink : colors.surface }}
        >
          <Feather name={icon} size={15} color={view === value ? colors.white : colors.ink} />
          <AppText variant="label" style={{ color: view === value ? colors.white : colors.ink }}>
            {label}
          </AppText>
        </Pressable>
      ))}
    </View>
  )
}

export default function Nearby() {
  const router = useRouter()
  const { city, cityId } = useCity()
  const nearby = useNearby()
  const { ready, asked, blocksReady, blockIds, selectedBlocks, areaName, coords, origin, range, detect, openPicker, setRange } = nearby

  const [draft, setDraft] = useState('')
  const [view, setView] = useState('shops')
  const [sort, setSort] = useState('name')
  const q = useDebounced(draft.trim(), 400)

  // First time here: ask for the position once, after the screen has had a moment to appear.
  useEffect(() => {
    if (!ready || asked || blockIds.length > 0) return undefined
    const timer = setTimeout(detect, 700)
    return () => clearTimeout(timer)
  }, [ready, asked, blockIds.length, detect])

  const query = discoverQuery({ cityId, blockIds, coords: origin, range, q })
  const shops = usePagedList(JSON.stringify(query), (page) => (query ? fetchDiscover({ ...query, page }) : Promise.resolve(NOTHING)))

  // The shared catalogue needs an area and a range narrower than the whole city.
  const canBrowse = Boolean(cityId) && blockIds.length > 0 && range !== 'city'
  const catalogParams = canBrowse ? catalogQuery({ blockIds, origin, range, sort, q }) : null
  const products = usePagedList(catalogParams ? JSON.stringify(catalogParams) : 'catalog:off', (page) =>
    catalogParams ? fetchCatalogBrowse({ ...catalogParams, page }) : Promise.resolve(NOTHING),
  )

  const areaMissing = Boolean(cityId) && needsArea({ range, blockIds, coords: origin })
  const wider = nextRange(range)
  const scopeLabel = range === 'block' && blockIds.length > 1 ? 'your blocks' : rangeLabel(range)

  const openBrand = (brand) => router.navigate(shopHref({ brandId: brand._id }))
  const list = view === 'products' ? products : shops

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="title">Nearby</AppText>
        <LocationChip onPress={openPicker} />
      </View>
      <SearchBar value={draft} onChangeText={setDraft} placeholder="Search a brand or a product…" label="Search a brand or a product" />
      <RangeBar />
      {areaMissing ? (
        <Pressable onPress={openPicker} accessibilityRole="button" style={{ backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md }}>
          <AppText variant="small" style={{ color: colors.warning }}>
            Choose your area to search {range === 'block' ? 'your block' : `within ${range} km`}. Showing the whole city for now. <AppText variant="label" style={{ color: colors.warning }}>Choose area</AppText>
          </AppText>
        </Pressable>
      ) : null}

      {cityId && blocksReady ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          {view === 'products' ? (
            <AppText variant="small" style={{ flex: 1 }} accessibilityLiveRegion="polite">
              {canBrowse && !products.loading && !products.error
                ? `${products.total} ${products.total === 1 ? 'product' : 'products'} in your area${q ? ` for “${q}”` : ''}${range !== 'city' ? ` within ${scopeLabel}` : ''}`
                : 'Products from the stores near you'}
            </AppText>
          ) : (
            <AppText variant="small" style={{ flex: 1 }} accessibilityLiveRegion="polite">
              {!shops.loading && !shops.error && shops.items.length > 0
                ? `${shops.total} ${shops.total === 1 ? 'brand' : 'brands'} with ${shops.meta?.totalBranches ?? 0} ${shops.meta?.totalBranches === 1 ? 'branch' : 'branches'}${q ? ` for “${q}”` : ''}${range !== 'city' && !areaMissing ? ` within ${scopeLabel}` : ''}${areaName && range !== 'block' ? ` of ${areaName}` : ''}`
                : 'Shops near you'}
            </AppText>
          )}
          <ViewToggle view={view} onChange={setView} />
        </View>
      ) : null}

      {view === 'products' && canBrowse && !products.loading && !products.error && products.items.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} accessibilityRole="radiogroup" accessibilityLabel="Sort products">
          {CATALOG_SORTS.filter((s) => s.key !== 'nearest' || origin).map((s) => (
            <Chip key={s.key} label={s.label} selected={sort === s.key} onPress={() => setSort(s.key)} />
          ))}
        </View>
      ) : null}

      {view === 'map' && cityId && !shops.loading && !shops.error && shops.items.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          <NearbyMap
            items={shops.items}
            zones={selectedBlocks}
            selectedIds={blockIds}
            origin={shops.meta?.origin}
            radiusKm={shops.meta?.radiusKm}
            originLabel={coords ? 'You are here' : areaName ? `Searching from ${areaName}` : 'Search centre'}
            onOpenBrand={openBrand}
          />
          <AppText variant="small">
            Tap a pin, then its label, to see that brand’s products. Shaded areas are the blocks you are shopping in.
            {shops.hasMore ? ' The map shows the shops loaded so far.' : ''}
          </AppText>
          {shops.hasMore ? <Button title="Load more shops" variant="outline" onPress={shops.loadMore} loading={shops.loadingMore} /> : null}
        </View>
      ) : null}
    </View>
  )

  let empty = null
  if (!cityId) {
    empty = (
      <EmptyState
        icon="map-pin"
        title="Where are you shopping?"
        message="Share your location or pick your city and area, and we’ll show the shops near you."
        action={
          <View style={{ gap: spacing.md }}>
            <Button title="Use my location" onPress={detect} loading={nearby.status === 'detecting'} />
            <Button title="Choose manually" variant="outline" onPress={openPicker} />
          </View>
        }
      />
    )
  } else if (view === 'products') {
    if (!canBrowse) {
      empty = (
        <EmptyState
          icon="package"
          title="Choose your area to compare products"
          message="Products are compared across the stores in your area. Pick one or more blocks, then a range narrower than the whole city."
          action={<Button title="Choose area" onPress={openPicker} />}
        />
      )
    } else if (products.loading) {
      empty = (
        <View style={{ gap: spacing.lg }}>
          {[0, 1].map((i) => (
            <Skeleton key={i} height={150} />
          ))}
        </View>
      )
    } else if (products.error) {
      empty = <EmptyState icon="wifi-off" tone="error" title="Couldn't load products" message={products.error} action={<Button title="Try again" onPress={products.refresh} />} />
    } else {
      empty = (
        <EmptyState
          icon="package"
          title={q ? `No products for “${q}” in your area` : 'No products in your area yet'}
          message="Try a wider range, another block, or a different search."
          action={wider ? <Button title={wider === 'city' ? 'Search the whole city' : `Try ${wider} km`} onPress={() => setRange(wider)} /> : undefined}
        />
      )
    }
  } else if (shops.loading) {
    empty = (
      <View style={{ gap: spacing.lg }}>
        {[0, 1].map((i) => (
          <Skeleton key={i} height={240} />
        ))}
      </View>
    )
  } else if (shops.error) {
    empty = <EmptyState icon="wifi-off" tone="error" title="Couldn't load nearby shops" message={shops.error} action={<Button title="Try again" onPress={shops.refresh} />} />
  } else if (shops.items.length === 0) {
    empty = (
      <EmptyState
        icon="shopping-bag"
        title={q ? `Nothing for “${q}” within ${scopeLabel}` : `No shops within ${scopeLabel} yet`}
        message={range === 'city' ? `We couldn't find any${q ? ' match' : ' shops'} in ${city?.name || 'this city'}. Try a different search.` : 'Try a wider range to see more shops.'}
        action={wider ? <Button title={wider === 'city' ? 'Search the whole city' : `Try ${wider} km`} onPress={() => setRange(wider)} /> : undefined}
      />
    )
  }

  const data = view === 'map' ? [] : view === 'products' ? products.items : shops.items

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <FlatList
        data={data}
        keyExtractor={(item) => (view === 'products' ? item.catalogProductId : item._id)}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        refreshing={view !== 'map' && list.refreshing}
        onRefresh={view === 'map' ? shops.refresh : list.refresh}
        onEndReached={view === 'map' ? undefined : list.loadMore}
        onEndReachedThreshold={0.6}
        renderItem={({ item }) =>
          view === 'products' ? (
            <CatalogProductCard item={item} onOpenProduct={(offer) => router.push(`/product/${offer.productId}`)} />
          ) : (
            <NearbyBrandCard brand={item} onOpenProduct={(product) => router.push(`/product/${product._id}`)} onSeeAll={() => openBrand(item)} />
          )
        }
        ListFooterComponent={
          view === 'map' ? null : list.loadingMore ? (
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
    </SafeAreaView>
  )
}
