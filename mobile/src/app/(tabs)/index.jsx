import { FlatList, Pressable, View } from 'react-native'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import Screen from '../../components/ui/Screen'
import SearchBar from '../../components/ui/SearchBar'
import SectionHeader from '../../components/ui/SectionHeader'
import Skeleton from '../../components/ui/Skeleton'
import { BrandLogo } from '../../components/BrandCard'
import { useCity } from '../../hooks/useCity'
import { useRemote } from '../../hooks/useRemote'
import { fetchBrands } from '../../services/catalog'
import { nearbyHref } from '../../utils/nav'
import { colors, spacing } from '../../theme'

export default function Home() {
  const router = useRouter()
  const { city, cityId } = useCity()
  const [search, setSearch] = useState('')

  const scope = cityId || 'all'
  const brands = useRemote(`brands:${scope}`, () => fetchBrands(cityId))
  const brandList = brands.data ?? []

  const goSearch = () => router.navigate(nearbyHref({ q: search.trim() }))

  return (
    <Screen onRefresh={brands.reload} refreshing={brands.refreshing}>
      <View style={{ marginBottom: spacing.lg }}>
        <AppText variant="title">CityCart</AppText>
        <AppText variant="small">{city ? `Shopping in ${city.name}` : 'Shopping in every city'}</AppText>
      </View>

      <SearchBar value={search} onChangeText={setSearch} onSubmit={goSearch} placeholder="Search products…" label="Search products" />

      {brands.status === 'error' ? (
        <View style={{ marginTop: spacing.xl }}>
          <EmptyState icon="wifi-off" tone="error" title="Can't reach the server" message={brands.error} action={<Button title="Try again" onPress={brands.reload} />} />
        </View>
      ) : (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Brands" actionLabel={brandList.length > 0 ? 'See all' : undefined} onAction={() => router.push('/brands')} />
          {brands.status === 'loading' ? (
            <View style={{ flexDirection: 'row', gap: spacing.lg }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={84} width={72} />
              ))}
            </View>
          ) : brandList.length === 0 ? (
            <AppText variant="small">No brands are selling here yet.</AppText>
          ) : (
            <FlatList
              horizontal
              data={brandList}
              keyExtractor={(b) => b._id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.lg }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => router.navigate(nearbyHref({ q: item.name }))}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, see their shops nearby`}
                  style={{ width: 76, alignItems: 'center' }}
                >
                  <BrandLogo brand={item} size={64} />
                  <AppText variant="small" numberOfLines={2} style={{ textAlign: 'center', marginTop: spacing.xs, fontSize: 12, lineHeight: 16, color: colors.ink }}>
                    {item.name}
                  </AppText>
                </Pressable>
              )}
            />
          )}
        </View>
      )}
    </Screen>
  )
}
