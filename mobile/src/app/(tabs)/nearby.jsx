import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import SearchBar from '../../components/ui/SearchBar'
import Skeleton from '../../components/ui/Skeleton'
import MapLayers from '../../components/MapLayers'
import NearbyBrandCard from '../../components/NearbyBrandCard'
import NearbyMap from '../../components/NearbyMap'
import RangeBar from '../../components/RangeBar'
import ViewToggle from '../../components/ViewToggle'
import { useCity } from '../../hooks/useCity'
import { useCityDirectory } from '../../hooks/useCityDirectory'
import { useDebounced } from '../../hooks/useDebounced'
import { useMapFocus } from '../../hooks/useMapFocus'
import { useNearby } from '../../hooks/useNearby'
import { usePagedList } from '../../hooks/usePagedList'
import { discoverQuery, fetchDiscover, needsArea } from '../../services/nearby'
import { isRadius, nextRange, rangeLabel } from '../../utils/range'
import { nextLayerState } from '../../utils/layerState'
import { colors, radius, spacing } from '../../theme'

const NOTHING = { items: [], pagination: { page: 1, pages: 0, total: 0 } }
const paramText = (value) => (Array.isArray(value) ? value[0] : value) || ''

const VIEWS = [
  ['shops', 'Shops', 'list'],
  ['map', 'Map', 'map'],
]

export default function Nearby() {
  const router = useRouter()
  const { city, cityId, cities } = useCity()
  const nearby = useNearby()
  const { ready, asked, blocks, blocksReady, blockIds, selectedBlocks, areaName, coords, pinned, origin, range, detect, setPin, setRange, status } = nearby
  const { focus, chooseCity } = useMapFocus(blocks)
  const params = useLocalSearchParams()
  const qParam = paramText(params.q)
  const requestId = paramText(params.t)
  const viewParam = paramText(params.view)

  const [draft, setDraft] = useState(qParam)
  const [view, setView] = useState('shops')
  // Each overlay shows everything, only the shopper's own, or nothing.
  const [blockLayer, setBlockLayer] = useState('all')
  const [storeLayer, setStoreLayer] = useState('all')
  const [picking, setPicking] = useState(false)
  const [recenter, setRecenter] = useState(0)

  // This tab stays mounted, so a search sent from Home (or a "change area" link)
  // arrives as new params.
  const [seen, setSeen] = useState({ q: qParam, requestId, view: viewParam })
  if (requestId !== seen.requestId || qParam !== seen.q || viewParam !== seen.view) {
    setSeen({ q: qParam, requestId, view: viewParam })
    setDraft(qParam)
    if (viewParam === 'map') setView('map')
  }

  const q = useDebounced(draft.trim(), 400)

  // First time here: ask for the position once, after the screen has had a moment to appear.
  useEffect(() => {
    if (!ready || asked || blockIds.length > 0) return undefined
    const timer = setTimeout(detect, 700)
    return () => clearTimeout(timer)
  }, [ready, asked, blockIds.length, detect])

  const query = discoverQuery({ cityId, blockIds, coords: origin, range, q })
  const shops = usePagedList(JSON.stringify(query), (page) => (query ? fetchDiscover({ ...query, page }) : Promise.resolve(NOTHING)))
  // "All stores" on the map means the whole city, even while the list keeps
  // searching inside the shopper's block.
  const cityStores = useCityDirectory({
    cityId,
    kind: 'stores',
    enabled: view === 'map' && storeLayer === 'all',
    q,
  })

  const areaMissing = Boolean(cityId) && needsArea({ range, blockIds, coords: origin })
  const wider = nextRange(range)
  const scopeLabel = range === 'block' && blockIds.length > 1 ? 'your blocks' : rangeLabel(range)
  const hasLocation = blockIds.length > 0 || Boolean(coords)
  const blockSet = new Set(blockIds.map(String))
  const inBlock = (store) => (store.branches || []).some((branch) => blockSet.has(String(branch.blockId)))
  const zones = blockLayer === 'all' ? blocks : blockLayer === 'mine' ? selectedBlocks : []
  const mapStores = storeLayer === 'all' ? (cityStores ?? shops.items) : storeLayer === 'mine' ? shops.items.filter(inBlock) : []

  // "See all products" opens the shop's own page, where its whole shelf lives.
  const openBrand = (brand) => router.push(`/store/${brand._id}`)
  const openMapPicker = () => {
    setView('map')
    setPicking(true)
  }
  // Tapping the map sets the shopper's spot when none is set, or while they are
  // deliberately changing it. Otherwise a tap leaves the saved spot alone.
  const handlePick = (lat, lng) => {
    if (!picking && hasLocation) return
    setPicking(false)
    setPin(lat, lng)
  }

  const map = view === 'map' && (
    <View style={{ borderRadius: radius.md }}>
      <NearbyMap
        items={mapStores}
        zones={zones}
        selectedIds={blockIds}
        origin={origin}
        pin={coords && pinned ? coords : null}
        radiusKm={isRadius(range) && origin ? Number(range) : null}
        originLabel={coords ? (pinned ? 'Your chosen spot' : 'You are here') : selectedBlocks.length === 1 ? `Centre of ${areaName}` : 'Search centre'}
        pickable={picking || !hasLocation}
        onPick={handlePick}
        onOpenBrand={openBrand}
        focus={focus}
        recenter={recenter}
      />
      <MapLayers
        cities={cities}
        cityId={cityId}
        onCityChange={chooseCity}
        layers={[
          { key: 'blocks', label: 'Blocks', mineLabel: 'my block', icon: 'layers', state: blockLayer, onCycle: () => setBlockLayer(nextLayerState) },
          { key: 'stores', label: 'Stores', mineLabel: 'my stores', icon: 'shopping-bag', state: storeLayer, onCycle: () => setStoreLayer(nextLayerState) },
        ]}
        actions={[
          { key: 'recenter', label: 'Recenter', icon: 'crosshair', onPress: () => setRecenter((n) => n + 1) },
          { key: 'pick', label: picking ? 'Cancel' : 'Choose location', icon: 'map-pin', active: picking, onPress: () => setPicking((v) => !v) },
        ]}
      />
      {picking || !hasLocation ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: spacing.sm, right: spacing.sm, bottom: spacing.sm, alignItems: 'center' }}>
          <View style={{ backgroundColor: 'rgba(30,58,47,0.92)', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
            <AppText variant="small" style={{ color: colors.white, textAlign: 'center' }}>
              {picking ? 'Tap the map to set your location.' : 'Tap the map to choose where you shop.'}
            </AppText>
          </View>
        </View>
      ) : null}
    </View>
  )

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <AppText variant="title">Nearby</AppText>
      <SearchBar value={draft} onChangeText={setDraft} placeholder="Search a brand or a product…" label="Search a brand or a product" />
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button
          title={status === 'detecting' ? 'Finding you…' : hasLocation ? 'Update my location' : 'Use my location'}
          variant="outline"
          onPress={detect}
          loading={status === 'detecting'}
          style={{ minHeight: 40, paddingHorizontal: spacing.lg }}
        />
        <AppText variant="small" style={{ flexShrink: 1 }}>
          {areaName ? `Shopping in ${areaName}` : city ? city.name : 'Location not set'}
          {coords && pinned ? ' · chosen on the map' : ''}
        </AppText>
      </View>
      <RangeBar />
      {areaMissing ? (
        <Pressable onPress={openMapPicker} accessibilityRole="button" style={{ backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md }}>
          <AppText variant="small" style={{ color: colors.warning }}>
            Choose your area to search {range === 'block' ? 'your block' : `within ${range} km`}. Showing the whole city for now.{' '}
            <AppText variant="label" style={{ color: colors.warning }}>Choose on the map</AppText>
          </AppText>
        </Pressable>
      ) : null}

      {blocksReady ? <ViewToggle view={view} onChange={setView} options={VIEWS} /> : null}

      {view === 'shops' ? (
        <AppText variant="small" accessibilityLiveRegion="polite">
          {!shops.loading && !shops.error && shops.items.length > 0
            ? `${shops.total} ${shops.total === 1 ? 'brand' : 'brands'} with ${shops.meta?.totalBranches ?? 0} ${shops.meta?.totalBranches === 1 ? 'branch' : 'branches'}${q ? ` for “${q}”` : ''}${range !== 'city' && !areaMissing ? ` within ${scopeLabel}` : ''}${areaName && range !== 'block' ? ` of ${areaName}` : ''}`
            : 'Shops near you'}
        </AppText>
      ) : null}

      {map}

      {view === 'map' ? (
        <AppText variant="small">
          Tap a pin, then its label, to open that store. Each layer can show everything, only yours, or be hidden.
          {storeLayer !== 'all' && shops.hasMore ? ' The map shows the shops loaded so far.' : ''}
        </AppText>
      ) : null}
      {view === 'map' && storeLayer !== 'all' && shops.hasMore ? (
        <Button title="Load more shops" variant="outline" onPress={shops.loadMore} loading={shops.loadingMore} />
      ) : null}
    </View>
  )

  let empty = null
  if (view === 'map') {
    empty = null
  } else if (!cityId) {
    empty = (
      <EmptyState
        icon="map-pin"
        title="Where are you shopping?"
        message="Share your location or choose your spot on the map, and we’ll show the shops near you."
        action={
          <View style={{ gap: spacing.md }}>
            <Button title="Use my location" onPress={detect} loading={status === 'detecting'} />
            <Button title="Open the map" variant="outline" onPress={() => setView('map')} />
          </View>
        }
      />
    )
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

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <FlatList
        data={view === 'map' ? [] : shops.items}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        refreshing={view !== 'map' && shops.refreshing}
        onRefresh={shops.refresh}
        onEndReached={view === 'map' ? undefined : shops.loadMore}
        onEndReachedThreshold={0.6}
        renderItem={({ item }) => (
          <NearbyBrandCard brand={item} onOpenProduct={(product) => router.push(`/product/${product._id}`)} onSeeAll={() => openBrand(item)} />
        )}
        ListFooterComponent={
          view === 'map' ? null : shops.loadingMore ? (
            <ActivityIndicator color={colors.clay} style={{ marginVertical: spacing.lg }} />
          ) : shops.moreError ? (
            <Pressable onPress={shops.loadMore} accessibilityRole="button" style={{ alignItems: 'center', padding: spacing.lg }}>
              <AppText variant="small" style={{ color: colors.danger }}>
                {shops.moreError} Tap to try again.
              </AppText>
            </Pressable>
          ) : null
        }
      />
    </SafeAreaView>
  )
}
