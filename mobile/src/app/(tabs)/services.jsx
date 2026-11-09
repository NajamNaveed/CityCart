import { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Chip from '../../components/ui/Chip'
import EmptyState from '../../components/ui/EmptyState'
import OptionSheet from '../../components/ui/OptionSheet'
import RangeBar from '../../components/RangeBar'
import SearchBar from '../../components/ui/SearchBar'
import Skeleton from '../../components/ui/Skeleton'
import ServiceProviderCard from '../../components/ServiceProviderCard'
import { useCity } from '../../hooks/useCity'
import { useDebounced } from '../../hooks/useDebounced'
import { useNearby } from '../../hooks/useNearby'
import { usePagedList } from '../../hooks/usePagedList'
import { useRemote } from '../../hooks/useRemote'
import { needsArea } from '../../services/nearby'
import { SORT_OPTIONS, discoverServices, fetchServiceCategories, serviceDiscoverQuery } from '../../services/services'
import { nextRange, rangeLabel } from '../../utils/range'
import { colors, spacing } from '../../theme'

const NOTHING = { items: [], pagination: { page: 1, pages: 0, total: 0 } }

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
  const { blocksReady, blockIds, areaName, coords, origin, range, setRange, detect, status } = useNearby()

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

  const areaMissing = Boolean(cityId) && needsArea({ range, blockIds, coords: origin })
  const wider = nextRange(range)
  const scope = range === 'block' && blockIds.length > 1 ? 'your blocks' : rangeLabel(range)
  const categoryLabel = categoryId
    ? categories.data?.find((item) => item._id === categoryId)?.name || 'Category'
    : 'All services'
  const sortLabel = SORT_OPTIONS.find((option) => option.value === sort)?.label || 'Recommended'
  const locationNote = LOCATION_NOTES[status]

  const categoryOptions = [
    { value: '', label: 'All services' },
    ...(categories.data || []).map((category) => ({ value: category._id, label: category.name })),
  ]

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
          style={{ minHeight: 40, paddingHorizontal: spacing.lg }}
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
        <View style={{ backgroundColor: colors.warningSoft, borderRadius: 8, padding: spacing.md }}>
          <AppText variant="small" style={{ color: colors.warning }}>
            Choose your area to search {range === 'block' ? 'your block' : `within ${range} km`}. Showing the whole city for now.
          </AppText>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Chip label={categoryLabel} icon="grid" selected={Boolean(categoryId)} onPress={() => setCategoryOpen(true)} accessibilityHint="Choose a service category" />
        <Chip label={sortLabel} icon="sliders" selected={sort !== 'rank'} onPress={() => setSortOpen(true)} accessibilityHint="Choose the sort order" />
      </View>

      <AppText variant="small" accessibilityLiveRegion="polite">
        {!providers.loading && !providers.error && providers.items.length > 0
          ? `${providers.total} ${providers.total === 1 ? 'provider' : 'providers'} · ${providers.meta?.totalOfferings ?? 0} ${providers.meta?.totalOfferings === 1 ? 'service' : 'services'}${q ? ` for “${q}”` : ''}`
          : 'Providers near you'}
      </AppText>

      {providers.hasMore && providers.items.length > 0 ? (
        <AppText variant="small">The list keeps loading as you scroll.</AppText>
      ) : null}
    </View>
  )

  let empty = null
  if (!blocksReady) {
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
        data={providers.loading ? [] : providers.items}
        keyExtractor={(provider) => provider._id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        refreshing={providers.refreshing}
        onRefresh={providers.refresh}
        onEndReached={providers.loadMore}
        onEndReachedThreshold={0.6}
        renderItem={({ item }) => <ServiceProviderCard provider={item} onPress={() => router.push(`/service/${item.slug}`)} />}
        ListFooterComponent={
          providers.loadingMore ? (
            <ActivityIndicator color={colors.clay} style={{ marginVertical: spacing.lg }} />
          ) : providers.moreError ? (
            <Pressable onPress={providers.loadMore} accessibilityRole="button" style={{ alignItems: 'center', padding: spacing.lg }}>
              <AppText variant="small" style={{ color: colors.danger }}>
                {providers.moreError} Tap to try again.
              </AppText>
            </Pressable>
          ) : null
        }
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
