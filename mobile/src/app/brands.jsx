import { useState } from 'react'
import { FlatList, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppText from '../components/ui/AppText'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import SearchBar from '../components/ui/SearchBar'
import Skeleton from '../components/ui/Skeleton'
import BackButton from '../components/BackButton'
import BrandCard from '../components/BrandCard'
import CityChip from '../components/CityChip'
import { useCity } from '../hooks/useCity'
import { useRemote } from '../hooks/useRemote'
import { fetchBrands } from '../services/catalog'
import { shopHref } from '../utils/nav'
import { colors, spacing } from '../theme'

export default function Brands() {
  const router = useRouter()
  const { city, cityId } = useCity()
  const [query, setQuery] = useState('')
  const brands = useRemote(`brands:${cityId || 'all'}`, () => fetchBrands(cityId))

  const needle = query.trim().toLowerCase()
  const shown = (brands.data ?? []).filter((b) => b.name.toLowerCase().includes(needle))

  const header = (
    <View style={{ paddingBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
        <BackButton />
        <CityChip />
      </View>
      <AppText variant="title" accessibilityRole="header">
        {city ? `Brands in ${city.name}` : 'All brands'}
      </AppText>
      <AppText variant="small" style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
        {brands.status === 'ready' ? `${shown.length} ${shown.length === 1 ? 'brand' : 'brands'} on CityCart` : 'Loading brands…'}
      </AppText>
      <SearchBar value={query} onChangeText={setQuery} placeholder="Search brands…" label="Search brands" />
    </View>
  )

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <FlatList
        data={brands.status === 'ready' ? shown : []}
        keyExtractor={(brand) => brand._id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={header}
        refreshing={brands.refreshing}
        onRefresh={brands.reload}
        renderItem={({ item }) => <BrandCard brand={item} onPress={() => router.navigate(shopHref({ brandId: item._id }))} />}
        ListEmptyComponent={
          brands.status === 'loading' ? (
            <View style={{ gap: spacing.md }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={80} />
              ))}
            </View>
          ) : brands.status === 'error' ? (
            <EmptyState icon="wifi-off" tone="error" title="Couldn't load brands" message={brands.error} action={<Button title="Try again" onPress={brands.reload} />} />
          ) : (
            <EmptyState
              icon={query ? 'search' : 'shopping-bag'}
              title={query ? `No brands match “${query}”` : 'No brands are selling here yet'}
              message={query ? 'Try a shorter or different search.' : 'Check back soon, or switch to another city.'}
            />
          )
        }
      />
    </SafeAreaView>
  )
}
