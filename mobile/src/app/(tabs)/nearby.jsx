import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import SearchBar from '../../components/ui/SearchBar'
import Skeleton from '../../components/ui/Skeleton'
import LocationChip from '../../components/LocationChip'
import LocationSheet from '../../components/LocationSheet'
import NearbyBrandCard from '../../components/NearbyBrandCard'
import NearbyMap from '../../components/NearbyMap'
import RangeBar from '../../components/RangeBar'
import { useCity } from '../../hooks/useCity'
import { useDebounced } from '../../hooks/useDebounced'
import { useNearby } from '../../hooks/useNearby'
import { usePagedList } from '../../hooks/usePagedList'
import { discoverQuery, fetchDiscover, needsArea } from '../../services/nearby'
import { shopHref } from '../../utils/nav'
import { nextRange, rangeLabel } from '../../utils/range'
import { colors, radius, spacing } from '../../theme'

const NOTHING = { items: [], pagination: { page: 1, pages: 0, total: 0 } }

function ViewToggle({ view, onChange }) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface }}>
      {[
        ['list', 'List', 'list'],
        ['map', 'Map', 'map'],
      ].map(([value, label, icon]) => (
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
  const { ready, asked, block, blockId, coords, range, detect, setRange } = nearby

  const [draft, setDraft] = useState('')
  const [view, setView] = useState('list')
  const [sheetOpen, setSheetOpen] = useState(false)
  const q = useDebounced(draft.trim(), 400)

  // First time here: ask for the position once, after the screen has had a moment to appear.
  useEffect(() => {
    if (!ready || asked || blockId) return undefined
    const timer = setTimeout(detect, 700)
    return () => clearTimeout(timer)
  }, [ready, asked, blockId, detect])

  const query = discoverQuery({ cityId, blockId, coords, range, q })
  const key = JSON.stringify(query)
  const list = usePagedList(key, (page) => (query ? fetchDiscover({ ...query, page }) : Promise.resolve(NOTHING)))
  const areaMissing = Boolean(cityId) && needsArea({ range, blockId, coords })
  const wider = nextRange(range)

  const openBrand = (brand) => router.navigate(shopHref({ brandId: brand._id }))
  const meta = list.meta

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="title">Nearby</AppText>
        <LocationChip onPress={() => setSheetOpen(true)} />
      </View>
      <SearchBar value={draft} onChangeText={setDraft} placeholder="Search a brand or a product…" label="Search a brand or a product" />
      <RangeBar />
      {areaMissing ? (
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          style={{ backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md }}
        >
          <AppText variant="small" style={{ color: colors.warning }}>
            Choose your area to search {range === 'block' ? 'your block' : `within ${range} km`}. Showing the whole city for now. <AppText variant="label" style={{ color: colors.warning }}>Choose area</AppText>
          </AppText>
        </Pressable>
      ) : null}
      {cityId && !list.loading && !list.error && list.items.length > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <AppText variant="small" style={{ flex: 1 }} accessibilityLiveRegion="polite">
            {list.total} {list.total === 1 ? 'brand' : 'brands'} with {meta?.totalBranches ?? 0} {meta?.totalBranches === 1 ? 'branch' : 'branches'}
            {q ? ` for “${q}”` : ''}
            {range !== 'city' && !areaMissing ? ` within ${rangeLabel(range)}` : ''}
            {block && range !== 'block' ? ` of ${block.name}` : ''}
          </AppText>
          <ViewToggle view={view} onChange={setView} />
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
            <Button title="Choose manually" variant="outline" onPress={() => setSheetOpen(true)} />
          </View>
        }
      />
    )
  } else if (list.loading) {
    empty = (
      <View style={{ gap: spacing.lg }}>
        {[0, 1].map((i) => (
          <Skeleton key={i} height={240} />
        ))}
      </View>
    )
  } else if (list.error) {
    empty = <EmptyState icon="wifi-off" tone="error" title="Couldn't load nearby shops" message={list.error} action={<Button title="Try again" onPress={list.refresh} />} />
  } else {
    empty = (
      <EmptyState
        icon="shopping-bag"
        title={q ? `Nothing for “${q}” within ${rangeLabel(range)}` : `No shops within ${rangeLabel(range)} yet`}
        message={range === 'city' ? `We couldn't find any${q ? ' match' : ' shops'} in ${city?.name || 'this city'}. Try a different search.` : 'Try a wider range to see more shops.'}
        action={wider ? <Button title={wider === 'city' ? 'Search the whole city' : `Try ${wider} km`} onPress={() => setRange(wider)} /> : undefined}
      />
    )
  }

  const showMap = view === 'map' && cityId && !list.loading && !list.error && list.items.length > 0

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <FlatList
        data={showMap ? [] : list.items}
        keyExtractor={(brand) => brand._id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <>
            {header}
            {showMap ? (
              <View style={{ gap: spacing.md }}>
                <NearbyMap
                  items={list.items}
                  origin={meta?.origin}
                  radiusKm={meta?.radiusKm}
                  originLabel={coords ? 'You are here' : block ? `Searching from ${block.name}` : 'Search centre'}
                  onOpenBrand={openBrand}
                />
                <AppText variant="small">
                  Tap a pin, then its label, to see that brand’s products.
                  {list.hasMore ? ' The map shows the shops loaded so far.' : ''}
                </AppText>
                {list.hasMore ? <Button title="Load more shops" variant="outline" onPress={list.loadMore} loading={list.loadingMore} /> : null}
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={showMap ? null : empty}
        refreshing={list.refreshing}
        onRefresh={list.refresh}
        onEndReached={showMap ? undefined : list.loadMore}
        onEndReachedThreshold={0.6}
        renderItem={({ item }) => <NearbyBrandCard brand={item} onOpenProduct={(product) => router.push(`/product/${product._id}`)} onSeeAll={() => openBrand(item)} />}
        ListFooterComponent={
          showMap ? null : list.loadingMore ? (
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
      <LocationSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </SafeAreaView>
  )
}
