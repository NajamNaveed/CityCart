import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import SearchBar from '../../components/ui/SearchBar'
import Skeleton from '../../components/ui/Skeleton'
import NearbyBrandCard from '../../components/NearbyBrandCard'
import NearbyMap from '../../components/NearbyMap'
import RangeBar from '../../components/RangeBar'
import { useCity } from '../../hooks/useCity'
import { useDebounced } from '../../hooks/useDebounced'
import { useNearby } from '../../hooks/useNearby'
import { usePagedList } from '../../hooks/usePagedList'
import { discoverQuery, fetchDiscover, needsArea } from '../../services/nearby'
import { isRadius, nextRange, rangeLabel } from '../../utils/range'
import { colors, radius, spacing } from '../../theme'

const NOTHING = { items: [], pagination: { page: 1, pages: 0, total: 0 } }
const paramText = (value) => (Array.isArray(value) ? value[0] : value) || ''

const VIEWS = [
  ['shops', 'Shops', 'list'],
  ['map', 'Map', 'map'],
]

function ViewToggle({ view, onChange }) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', width: '100%', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface }}>
      {VIEWS.map(([value, label, icon]) => (
        <Pressable
          key={value}
          onPress={() => onChange(value)}
          accessibilityRole="radio"
          accessibilityState={{ selected: view === value }}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, paddingHorizontal: spacing.sm, backgroundColor: view === value ? colors.ink : colors.surface }}
        >
          <Feather name={icon} size={15} color={view === value ? colors.white : colors.ink} />
          <AppText variant="label" numberOfLines={1} style={{ color: view === value ? colors.white : colors.ink }}>
            {label}
          </AppText>
        </Pressable>
      ))}
    </View>
  )
}

// A small on-map control: Blocks, Shops, or the location picker.
function MapControl({ label, icon, on, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      hitSlop={6}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        minHeight: 36,
        paddingHorizontal: spacing.sm,
        backgroundColor: on ? colors.ink : colors.surface,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      <Feather name={icon} size={14} color={on ? colors.white : colors.ink} />
      <AppText variant="label" style={{ color: on ? colors.white : colors.ink, fontSize: 12 }}>
        {label}
      </AppText>
    </Pressable>
  )
}

export default function Nearby() {
  const router = useRouter()
  const { city, cityId } = useCity()
  const nearby = useNearby()
  const { ready, asked, blocksReady, blockIds, selectedBlocks, areaName, coords, pinned, origin, range, detect, setPin, setRange, status } = nearby
  const params = useLocalSearchParams()
  const qParam = paramText(params.q)
  const requestId = paramText(params.t)
  const viewParam = paramText(params.view)

  const [draft, setDraft] = useState(qParam)
  const [view, setView] = useState('shops')
  const [showBlocks, setShowBlocks] = useState(true)
  const [showShops, setShowShops] = useState(true)
  const [picking, setPicking] = useState(false)

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

  const areaMissing = Boolean(cityId) && needsArea({ range, blockIds, coords: origin })
  const wider = nextRange(range)
  const scopeLabel = range === 'block' && blockIds.length > 1 ? 'your blocks' : rangeLabel(range)
  const hasLocation = blockIds.length > 0 || Boolean(coords)

  // No brand page any more: a brand's "see all" becomes a Nearby search for its name.
  const openBrand = (brand) => router.navigate({ pathname: '/nearby', params: { q: brand.name, t: String(Date.now()) } })
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
        items={showShops ? shops.items : []}
        zones={showBlocks ? selectedBlocks : []}
        selectedIds={blockIds}
        origin={origin}
        pin={coords && pinned ? coords : null}
        radiusKm={isRadius(range) && origin ? Number(range) : null}
        originLabel={coords ? (pinned ? 'Your chosen spot' : 'You are here') : selectedBlocks.length === 1 ? `Centre of ${areaName}` : 'Search centre'}
        pickable={picking || !hasLocation}
        onPick={handlePick}
        onOpenBrand={openBrand}
      />
      <View style={{ position: 'absolute', top: spacing.sm, right: spacing.sm, alignItems: 'flex-end', gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          <MapControl label="Blocks" icon="layers" on={showBlocks} onPress={() => setShowBlocks((v) => !v)} />
          <MapControl label="Shops" icon="shopping-bag" on={showShops} onPress={() => setShowShops((v) => !v)} />
        </View>
        <MapControl label={picking ? 'Cancel' : 'Choose location'} icon="map-pin" on={picking} onPress={() => setPicking((v) => !v)} />
      </View>
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

      {blocksReady ? <ViewToggle view={view} onChange={setView} /> : null}

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
          Tap a pin, then its label, to see that brand’s products. Shaded areas are the blocks you are shopping in.
          {shops.hasMore ? ' The map shows the shops loaded so far.' : ''}
        </AppText>
      ) : null}
      {view === 'map' && shops.hasMore ? (
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
