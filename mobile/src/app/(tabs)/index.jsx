import { useWindowDimensions, View } from 'react-native'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Chip from '../../components/ui/Chip'
import EmptyState from '../../components/ui/EmptyState'
import Screen from '../../components/ui/Screen'
import SearchBar from '../../components/ui/SearchBar'
import SectionHeader from '../../components/ui/SectionHeader'
import Skeleton from '../../components/ui/Skeleton'
import StoreCard from '../../components/StoreCard'
import ProductCard from '../../components/ProductCard'
import CityChip from '../../components/CityChip'
import { useCity } from '../../hooks/useCity'
import { useNearby } from '../../hooks/useNearby'
import { useRemote } from '../../hooks/useRemote'
import { fetchHomeFeed, storeInBlocks } from '../../services/home'
import { nearbyHref } from '../../utils/nav'
import { spacing } from '../../theme'

function SectionSkeleton({ cardWidth }) {
  return (
    <>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {[0, 1].map((i) => (
          <Skeleton key={i} height={300} width={cardWidth} />
        ))}
      </View>
      <Skeleton height={22} width="55%" style={{ marginTop: spacing.xl }} />
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
        {[0, 1].map((i) => (
          <Skeleton key={i} height={220} width={cardWidth} />
        ))}
      </View>
    </>
  )
}

export default function Home() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const { cities, city, cityId, setCityId, ready } = useCity()
  const { blockIds, areaName } = useNearby()
  const [search, setSearch] = useState('')

  // The feed is scoped to the chosen city. Without one the shopper picks a city
  // first, because every shop on CityCart belongs to one.
  const home = useRemote(`home:${cityId || 'none'}:${blockIds.join(',')}`, () => fetchHomeFeed({ cityId, blockIds }))
  const stores = home.data?.stores ?? []
  const products = home.data?.products ?? []

  const columns = width >= 700 ? 3 : 2
  const cardWidth = Math.floor((width - spacing.lg * 2 - spacing.md * (columns - 1)) / columns)

  const goSearch = () => router.navigate(nearbyHref({ q: search.trim() }))

  const feed = !ready ? (
    <SectionSkeleton cardWidth={cardWidth} />
  ) : !cityId ? (
    <EmptyState
      icon="map-pin"
      title="Where are you shopping?"
      message={cities.length > 0 ? 'Pick your city to see the shops and products around you.' : 'No cities are live yet. Check back soon.'}
      action={
        cities.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {cities.map((item) => (
              <Chip key={item._id} label={item.name} onPress={() => setCityId(item._id)} />
            ))}
          </View>
        ) : undefined
      }
    />
  ) : home.status === 'error' ? (
    <EmptyState icon="wifi-off" tone="error" title="Couldn't load your city" message={home.error} action={<Button title="Try again" onPress={home.reload} />} />
  ) : home.status === 'loading' ? (
    <SectionSkeleton cardWidth={cardWidth} />
  ) : stores.length === 0 ? (
    <EmptyState
      icon="shopping-bag"
      title={`No stores in ${city?.name || 'this city'} yet`}
      message="The block is still opening up. Try another city, or check back soon."
      action={<Button title="Browse nearby" variant="outline" onPress={() => router.navigate('/nearby')} />}
    />
  ) : (
    <>
      <SectionHeader title="Stores on your street" actionLabel="All stores" onAction={() => router.navigate('/brands')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {stores.map((store) => (
          <StoreCard
            key={store._id}
            store={store}
            inBlock={storeInBlocks(store, blockIds)}
            width={cardWidth}
            onPress={() => router.push(`/store/${store._id}`)}
          />
        ))}
      </View>
      <AppText variant="small" style={{ marginTop: spacing.md }}>
        {areaName
          ? `Shops in ${areaName} come first. Set a range in Nearby to widen the search.`
          : `Showing shops across ${city?.name || 'the city'}. Set your block in Nearby to see what is closest.`}
      </AppText>

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader
          title={areaName ? 'Picked from your block' : 'Picked from around town'}
          actionLabel={products.length > 0 ? 'Browse all' : undefined}
          onAction={() => router.navigate('/nearby')}
        />
        {products.length === 0 ? (
          <AppText variant="small">The shelf is being stocked. Check the shops near you in the meantime.</AppText>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {products.map((product) => (
              <ProductCard
                key={product._id}
                product={{ ...product, images: product.image ? [product.image] : [] }}
                brandName={product.brandName}
                width={cardWidth}
                onPress={() => router.push(`/product/${product._id}`)}
              />
            ))}
          </View>
        )}
      </View>
    </>
  )

  return (
    <Screen onRefresh={cityId ? home.reload : undefined} refreshing={home.refreshing}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <AppText variant="title">CityCart</AppText>
          <AppText variant="small" numberOfLines={1} style={{ marginTop: 2 }}>
            {city ? `Shopping in ${city.name}` : 'Local shops, one cart'}
          </AppText>
        </View>
        <CityChip />
      </View>

      <SearchBar value={search} onChangeText={setSearch} onSubmit={goSearch} placeholder="Search shops or products…" label="Search shops or products" />

      <View style={{ marginTop: spacing.xl }}>{feed}</View>
    </Screen>
  )
}
