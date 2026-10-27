import { FlatList, Pressable, View, useWindowDimensions } from 'react-native'
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
import CityChip from '../../components/CityChip'
import ProductCard from '../../components/ProductCard'
import { useCity } from '../../hooks/useCity'
import { useRatings } from '../../hooks/useRatings'
import { useRemote } from '../../hooks/useRemote'
import { fetchBrands, fetchProducts } from '../../services/catalog'
import { shopHref } from '../../utils/nav'
import { colors, spacing } from '../../theme'

const ARRIVALS = 8

export default function Home() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const { city, cityId } = useCity()
  const [search, setSearch] = useState('')

  const scope = cityId || 'all'
  const brands = useRemote(`brands:${scope}`, () => fetchBrands(cityId))
  const arrivals = useRemote(`arrivals:${scope}`, () => fetchProducts({ cityId, limit: ARRIVALS }))

  const products = arrivals.data?.items ?? []
  const ratings = useRatings(products)
  const brandList = brands.data ?? []
  const brandName = Object.fromEntries(brandList.map((b) => [b._id, b.name]))
  const cardWidth = Math.floor((width - spacing.lg * 2 - spacing.md) / 2)

  const failed = brands.status === 'error' && arrivals.status === 'error'
  const reload = () => {
    brands.reload()
    arrivals.reload()
  }

  const goSearch = () => router.navigate(shopHref({ q: search.trim() }))

  return (
    <Screen onRefresh={reload} refreshing={brands.refreshing || arrivals.refreshing}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
        <View style={{ flex: 1, paddingRight: spacing.md }}>
          <AppText variant="title">CityCart</AppText>
          <AppText variant="small">{city ? `Shopping in ${city.name}` : 'Shopping in every city'}</AppText>
        </View>
        <CityChip />
      </View>

      <SearchBar value={search} onChangeText={setSearch} onSubmit={goSearch} placeholder="Search products…" label="Search products" />

      {failed ? (
        <View style={{ marginTop: spacing.xl }}>
          <EmptyState icon="wifi-off" tone="error" title="Can't reach the server" message={brands.error} action={<Button title="Try again" onPress={reload} />} />
        </View>
      ) : (
        <>
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
                    onPress={() => router.navigate(shopHref({ brandId: item._id }))}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}, see products`}
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

          <View style={{ marginTop: spacing.xl }}>
            <SectionHeader title="New arrivals" actionLabel={products.length > 0 ? 'Shop all' : undefined} onAction={() => router.navigate('/shop')} />
            {arrivals.status === 'loading' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={{ width: cardWidth }}>
                    <Skeleton height={cardWidth * 1.25} />
                    <Skeleton height={14} width="70%" style={{ marginTop: spacing.sm }} />
                    <Skeleton height={14} width="40%" style={{ marginTop: spacing.xs }} />
                  </View>
                ))}
              </View>
            ) : arrivals.status === 'error' ? (
              <EmptyState icon="alert-circle" tone="error" title="Couldn't load products" message={arrivals.error} action={<Button title="Try again" onPress={arrivals.reload} />} />
            ) : products.length === 0 ? (
              <EmptyState icon="package" title="No products yet" message={city ? `Nothing is on sale in ${city.name} yet.` : 'Nothing is on sale yet.'} />
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xl }}>
                {products.map((product) => (
                  <ProductCard
                    key={product._id}
                    product={product}
                    brandName={brandName[product.brandId]}
                    rating={ratings[product._id]}
                    width={cardWidth}
                    onPress={() => router.push(`/product/${product._id}`)}
                  />
                ))}
              </View>
            )}
          </View>
        </>
      )}

    </Screen>
  )
}
