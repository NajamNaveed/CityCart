import { useState } from 'react'
import { FlatList, Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Chip from '../../components/ui/Chip'
import EmptyState from '../../components/ui/EmptyState'
import OptionSheet from '../../components/ui/OptionSheet'
import MapLayers from '../../components/MapLayers'
import NearbyMap from '../../components/NearbyMap'
import ListFooter from '../../components/ListFooter'
import RangeBar from '../../components/RangeBar'
import SearchBar from '../../components/ui/SearchBar'
import Skeleton from '../../components/ui/Skeleton'
import ServiceProviderCard from '../../components/ServiceProviderCard'
import ViewToggle from '../../components/ViewToggle'
import { useCity } from '../../hooks/useCity'
import { useCityDirectory } from '../../hooks/useCityDirectory'
import { useDebounced } from '../../hooks/useDebounced'
import { useMapFocus } from '../../hooks/useMapFocus'
import { useNearby } from '../../hooks/useNearby'
import { usePagedList } from '../../hooks/usePagedList'
import { useRemote } from '../../hooks/useRemote'
import { needsArea } from '../../services/nearby'
import { SORT_OPTIONS, discoverServices, fetchServiceCategories, serviceDiscoverQuery } from '../../services/services'
import { isRadius, nextRange, rangeLabel } from '../../utils/range'
import { nextLayerState } from '../../utils/layerState'
import { colors, radius, spacing } from '../../theme'

const NOTHING = { items: [], pagination: { page: 1, pages: 0, total: 0 } }

const VIEWS = [
  ['providers', 'Providers', 'list'],
  ['map', 'Map', 'map'],
]

const LOCATION_NOTES = {
  denied: 'Location permission was not given. Pick a city instead.',
  servicesOff: 'Location is switched off on this phone.',
  timeout: 'Finding your location took too long.',
  outside: 'No service area is nearby. Pick a city instead.',
  error: 'Your location is not available right now.',
}

function SortSheet({ visible, sort, onSelect, onClose }) {
  return (
    <OptionSheet
      visible={visible}
      title="Sort providers"
      options={SORT_OPTIONS}
      selected={sort}
      onSelect={onSelect}
      onClose={onClose}
    />
  )
}

export default function Services() {
  const router = useRouter()
  const { cities, city, cityId, setCityId } = useCity()
  const { blocks, blocksReady, blockIds, selectedBlocks, areaName, coords, pinned, origin, range, setRange, detect, setPin, status } = useNearby()
  const { focus, chooseCity } = useMapFocus(blocks)

  const [view, setView] = useState('providers')
  // Each overlay shows everything, only the shopper's own, or nothing.
  const [blockLayer, setBlockLayer] = useState('all')
  const [providerLayer, setProviderLayer] = useState('all')
  const [picking, setPicking] = useState(false)
  const [recenter, setRecenter] = useState(0)
  const [draft, setDraft] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [sort, setSort] = useState('rank')
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)

  const q = useDebounced(draft.trim(), 400)
  const categories = useRemote('service-categories', fetchServiceCategories)

  const query = blocksReady
    ? serviceDiscoverQuery({ cityId, blockIds, coords, origin, range, q, categoryId, sort })
    : null
  const providers = usePagedList(JSON.stringify(query), (page) =>
    query ? discoverServices({ ...query, page }) : Promise.resolve(NOTHING),
  )
  // "All providers" on the map means the whole city, even while the list keeps
  // searching inside the shopper's block.
  const cityProviders = useCityDirectory({
    cityId,
    kind: 'providers',
    enabled: view === 'map' && providerLayer === 'all',
    q,
    categoryId,
  })

  const areaMissing = Boolean(cityId) && needsArea({ range, blockIds, coords: origin })
  const wider = nextRange(range)
  const scope = range === 'block' && blockIds.length > 1 ? 'your blocks' : rangeLabel(range)
  const hasLocation = blockIds.length > 0 || Boolean(coords)
  const blockSet = new Set(blockIds.map(String))
  const inMyBlock = (provider) => blockSet.has(String(provider.block?._id))
  const zones = blockLayer === 'all' ? blocks : blockLayer === 'mine' ? selectedBlocks : []
  const mapProviders = providerLayer === 'all' ? (cityProviders ?? providers.items) : providerLayer === 'mine' ? providers.items.filter(inMyBlock) : []
  const openProvider = (provider) => router.push(`/service/${provider.slug}`)
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

  const categoryLabel = categoryId
    ? categories.data?.find((item) => item._id === categoryId)?.name || 'Category'
    : 'All services'
  const sortLabel = SORT_OPTIONS.find((option) => option.value === sort)?.label || 'Recommended'
  const locationNote = LOCATION_NOTES[status]

  const categoryOptions = [
    { value: '', label: 'All services' },
    ...(categories.data || []).map((category) => ({ value: category._id, label: category.name })),
  ]

  const map = view === 'map' && (
    <View style={{ borderRadius: radius.md }}>
      <NearbyMap
        items={[]}
        providers={mapProviders}
        zones={zones}
        selectedIds={blockIds}
        origin={origin}
        pin={coords && pinned ? coords : null}
        radiusKm={isRadius(range) && origin ? Number(range) : null}
        originLabel={coords ? (pinned ? 'Your chosen spot' : 'You are here') : selectedBlocks.length === 1 ? `Centre of ${areaName}` : 'Search centre'}
        pickable={picking || !hasLocation}
        onPick={handlePick}
        onOpenProvider={openProvider}
        focus={focus}
        recenter={recenter}
      />
      <MapLayers
        cities={cities}
        cityId={cityId}
        onCityChange={chooseCity}
        layers={[
          { key: 'blocks', label: 'Blocks', mineLabel: 'my block', icon: 'layers', state: blockLayer, onCycle: () => setBlockLayer(nextLayerState) },
          { key: 'providers', label: 'Providers', mineLabel: 'my providers', icon: 'tool', state: providerLayer, onCycle: () => setProviderLayer(nextLayerState) },
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
              {picking ? 'Tap the map to set your location.' : 'Tap the map to choose where you need a service.'}
            </AppText>
          </View>
        </View>
      ) : null}
    </View>
  )

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <View>
        <AppText variant="title">Local services</AppText>
        <AppText variant="small" style={{ marginTop: 2 }}>
          Cleaners, repairs, beauty and more — book a provider in your block.
        </AppText>
      </View>

      <SearchBar value={draft} onChangeText={setDraft} placeholder="Search a service or provider…" label="Search a service or provider" />

      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button
          title={status === 'detecting' ? 'Finding you…' : blockIds.length > 0 || coords ? 'Update my location' : 'Use my location'}
          variant="outline"
          onPress={detect}
          loading={status === 'detecting'}
          style={{ minHeight: 44, paddingHorizontal: spacing.lg }}
        />
        <AppText variant="small" style={{ flexShrink: 1 }}>
          {areaName ? `Looking in ${areaName}` : city ? city.name : 'Location not set'}
        </AppText>
      </View>
      {locationNote ? (
        <AppText variant="small" style={{ color: colors.warning }}>
          {locationNote}
        </AppText>
      ) : null}

      <RangeBar />

      {areaMissing ? (
        <Pressable onPress={openMapPicker} accessibilityRole="button" style={{ backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md }}>
          <AppText variant="small" style={{ color: colors.warning }}>
            Choose your area to search {range === 'block' ? 'your block' : `within ${range} km`}. Showing the whole city for now.{' '}
            <AppText variant="label" style={{ color: colors.warning }}>Choose on the map</AppText>
          </AppText>
        </Pressable>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Chip label={categoryLabel} icon="grid" selected={Boolean(categoryId)} onPress={() => setCategoryOpen(true)} accessibilityHint="Choose a service category" />
        <Chip label={sortLabel} icon="sliders" selected={sort !== 'rank'} onPress={() => setSortOpen(true)} accessibilityHint="Choose the sort order" />
      </View>

      {blocksReady ? <ViewToggle view={view} onChange={setView} options={VIEWS} /> : null}

      {view === 'providers' ? (
        <AppText variant="small" accessibilityLiveRegion="polite">
          {!providers.loading && !providers.error && providers.items.length > 0
            ? `${providers.total} ${providers.total === 1 ? 'provider' : 'providers'} · ${providers.meta?.totalOfferings ?? 0} ${providers.meta?.totalOfferings === 1 ? 'service' : 'services'}${q ? ` for “${q}”` : ''}`
            : 'Providers near you'}
        </AppText>
      ) : null}

      {map}

      {view === 'map' ? (
        <AppText variant="small">
          Tap a pin, then its label, to open that provider. Each layer can show everything, only yours, or be hidden.
          {providerLayer !== 'all' && providers.hasMore ? ' The map shows the providers loaded so far.' : ''}
        </AppText>
      ) : null}
      {view === 'map' && providerLayer !== 'all' && providers.hasMore ? (
        <View style={{ gap: spacing.sm }}>
          <Button title="Load more providers" variant="outline" onPress={providers.loadMore} loading={providers.loadingMore} />
          {providers.moreError ? (
            <AppText variant="small" accessibilityRole="alert" style={{ color: colors.danger }}>
              Couldn&apos;t load more providers. {providers.moreError}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  )

  let empty = null
  if (view === 'map') {
    empty = null
  } else if (!blocksReady) {
    empty = (
      <View style={{ gap: spacing.md }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={170} />
        ))}
      </View>
    )
  } else if (!cityId) {
    empty = (
      <EmptyState
        icon="map-pin"
        title="Where should we look?"
        message="Share your location, or pick a city, and we’ll show the service providers around you."
        action={
          <View style={{ gap: spacing.md }}>
            <Button title="Use my location" onPress={detect} loading={status === 'detecting'} />
            <Button title="Open the map" variant="outline" onPress={() => setView('map')} />
            {cities.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm }}>
                {cities.map((item) => (
                  <Chip key={item._id} label={item.name} onPress={() => setCityId(item._id)} />
                ))}
              </View>
            ) : null}
          </View>
        }
      />
    )
  } else if (providers.loading) {
    empty = (
      <View style={{ gap: spacing.md }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={170} />
        ))}
      </View>
    )
  } else if (providers.error) {
    empty = (
      <EmptyState
        icon="wifi-off"
        tone="error"
        title="Couldn't load services"
        message={providers.error}
        action={<Button title="Try again" onPress={providers.refresh} />}
      />
    )
  } else if (providers.items.length === 0) {
    empty = (
      <EmptyState
        icon="tool"
        title={q ? `No services for “${q}” within ${scope}` : `No providers within ${scope} yet`}
        message={
          range === 'city'
            ? `Nothing matched in ${city?.name || 'this city'}. Try a different search or category.`
            : 'Try a wider range to see more providers.'
        }
        action={wider ? <Button title={wider === 'city' ? 'Search the whole city' : `Try ${wider} km`} onPress={() => setRange(wider)} /> : undefined}
      />
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <FlatList
        data={view === 'map' ? [] : providers.loading ? [] : providers.items}
        keyExtractor={(provider) => provider._id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        refreshing={view !== 'map' && providers.refreshing}
        onRefresh={providers.refresh}
        onEndReached={view === 'map' ? undefined : providers.loadMore}
        onEndReachedThreshold={0.6}
        renderItem={({ item }) => <ServiceProviderCard provider={item} onPress={() => openProvider(item)} />}
        ListFooterComponent={view === 'map' ? null : <ListFooter list={providers} />}
      />

      <OptionSheet
        visible={categoryOpen}
        title="Service category"
        options={categoryOptions}
        selected={categoryId}
        onSelect={(value) => {
          setCategoryId(value)
          setCategoryOpen(false)
        }}
        onClose={() => setCategoryOpen(false)}
      />
      <SortSheet
        visible={sortOpen}
        sort={sort}
        onSelect={(value) => {
          setSort(value)
          setSortOpen(false)
        }}
        onClose={() => setSortOpen(false)}
      />
    </SafeAreaView>
  )
}
