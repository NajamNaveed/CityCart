import { useState } from 'react'
import { Image, Linking, Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import SectionHeader from '../../components/ui/SectionHeader'
import Skeleton from '../../components/ui/Skeleton'
import BackButton from '../../components/BackButton'
import { BrandLogo } from '../../components/BrandCard'
import ExpandableText from '../../components/ExpandableText'
import ProductCard from '../../components/ProductCard'
import { useRemote } from '../../hooks/useRemote'
import { fetchStorefront } from '../../services/catalog'
import { isObjectId } from '../../utils/ids'
import { nearbyHref } from '../../utils/nav'
import { colors, radius, spacing } from '../../theme'

const DAYS = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
]

function addressLine(address) {
  if (!address || typeof address !== 'object') return ''
  return [address.addressLine, address.city, address.state].filter(Boolean).join(', ')
}

function contactValue(contact, keys) {
  if (!contact || typeof contact !== 'object') return ''
  for (const key of keys) {
    if (contact[key]) return String(contact[key])
  }
  return ''
}

function openHours(hours) {
  if (!hours || typeof hours !== 'object') return null
  const open = DAYS.filter(([key]) => hours[key] && String(hours[key]).toLowerCase() !== 'closed')
  if (open.length === 0) return null
  return { days: open.map(([, label]) => label.slice(0, 3)).join(' · '), sample: String(hours[open[0][0]]) }
}

function categoryNames(categories) {
  const names = categories.flatMap((category) => [category, ...(category.children || [])]).map((category) => category.name).filter(Boolean)
  return [...new Set(names)].slice(0, 10)
}

function StoreBanner({ name, logo, banner, address }) {
  const [failed, setFailed] = useState(false)
  const show = Boolean(banner) && !failed
  return (
    <View style={{ height: 220, backgroundColor: colors.ink, overflow: 'hidden' }}>
      {show ? (
        <Image
          source={{ uri: banner }}
          accessibilityLabel={name}
          resizeMode="cover"
          onError={() => setFailed(true)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.lg,
          paddingTop: spacing.xxl,
          backgroundColor: 'rgba(15,23,42,0.78)',
        }}
      >
        <BrandLogo brand={{ name, logo }} size={54} />
        <View style={{ flex: 1 }}>
          <AppText variant="small" style={{ color: colors.cream, fontSize: 10, lineHeight: 14, letterSpacing: 1.6, textTransform: 'uppercase' }}>
            On your block
          </AppText>
          <AppText variant="heading" numberOfLines={2} style={{ color: colors.white, fontSize: 26, lineHeight: 32 }}>
            {name}
          </AppText>
          {address ? (
            <AppText variant="small" numberOfLines={2} style={{ color: colors.cream, marginTop: 2 }}>
              {address}
            </AppText>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function ContactRow({ icon, children }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
      <Feather name={icon} size={16} color={colors.clay} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  )
}

function StoreView({ data, onShop, refreshing }) {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const { brand, store, categories, featuredProducts } = data
  const name = store?.name || brand?.name || 'Store'
  const description = store?.description || brand?.description
  const banner = store?.banner || brand?.coverImage
  const logo = store?.logo || brand?.logo
  const address = addressLine(store?.address)
  const phone = contactValue(store?.contact, ['phone', 'phoneNumber', 'mobile'])
  const email = contactValue(store?.contact, ['email'])
  const hours = openHours(store?.businessHours)
  const tags = categoryNames(categories)

  const columns = width >= 700 ? 3 : 2
  const cardWidth = Math.floor((width - spacing.lg * 2 - spacing.md * (columns - 1)) / columns)

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onShop.refresh} tintColor={colors.clay} colors={[colors.clay]} />}>
      <StoreBanner name={name} logo={logo} banner={banner} address={address} />

      <View style={{ padding: spacing.lg }}>
        {description ? (
          <ExpandableText text={description} style={{ fontSize: 15, lineHeight: 23, color: colors.muted }} />
        ) : null}

        {tags.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg }}>
            {tags.map((tag) => (
              <View key={tag} style={{ borderRadius: radius.pill, backgroundColor: colors.sand, paddingHorizontal: spacing.md, paddingVertical: 5 }}>
                <AppText variant="small" style={{ color: colors.ink, fontSize: 12, lineHeight: 16 }}>
                  {tag}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Fresh from this store" actionLabel="See everything" onAction={onShop.shop} />
          {featuredProducts.length === 0 ? (
            <EmptyState icon="shopping-bag" title="The shelves are being stocked" message="This store has not listed anything yet. Check back soon." />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              {featuredProducts.map((product) => (
                <ProductCard
                  key={product._id}
                  product={product}
                  brandName={name}
                  width={cardWidth}
                  onPress={() => router.push(`/product/${product._id}`)}
                />
              ))}
            </View>
          )}
        </View>

        <View style={{ marginTop: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: spacing.lg }}>
          <AppText variant="small" style={{ fontSize: 10, lineHeight: 14, letterSpacing: 1.4, textTransform: 'uppercase' }}>
            Visit the shop
          </AppText>
          <AppText variant="heading" style={{ fontSize: 20, lineHeight: 26, marginTop: spacing.xs }}>
            {store?.name || name}
          </AppText>

          <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
            {address ? (
              <ContactRow icon="map-pin">
                <AppText variant="small" style={{ color: colors.ink }}>
                  {address}
                </AppText>
              </ContactRow>
            ) : null}
            {phone ? (
              <ContactRow icon="phone">
                <Pressable onPress={() => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`)} accessibilityRole="link" accessibilityLabel={`Call ${name}`} hitSlop={6}>
                  <AppText variant="label" style={{ color: colors.clay }}>
                    {phone}
                  </AppText>
                </Pressable>
              </ContactRow>
            ) : null}
            {email ? (
              <ContactRow icon="mail">
                <Pressable onPress={() => Linking.openURL(`mailto:${email}`)} accessibilityRole="link" accessibilityLabel={`Email ${name}`} hitSlop={6}>
                  <AppText variant="label" style={{ color: colors.clay }}>
                    {email}
                  </AppText>
                </Pressable>
              </ContactRow>
            ) : null}
            {hours ? (
              <ContactRow icon="clock">
                <AppText variant="small" style={{ color: colors.ink }}>
                  {hours.days}
                </AppText>
                <AppText variant="small">Typically {hours.sample}</AppText>
              </ContactRow>
            ) : null}
            {!address && !phone && !email && !hours ? <AppText variant="small">Contact details are not listed yet.</AppText> : null}
          </View>

          <View style={{ borderTopWidth: 1, borderTopColor: colors.line, marginTop: spacing.lg, paddingTop: spacing.md }}>
            <AppText variant="small" style={{ lineHeight: 19 }}>
              Cash at the door. This store packs and delivers its own orders inside 1.5 km.
            </AppText>
            <Button title="Shop this store" onPress={onShop.shop} style={{ marginTop: spacing.md }} />
          </View>
        </View>
      </View>
    </ScrollView>
  )
}

function StoreSkeleton() {
  return (
    <View style={{ padding: spacing.lg, gap: spacing.md }}>
      <Skeleton height={220} />
      <Skeleton height={18} width="70%" />
      <Skeleton height={18} width="45%" />
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
        {[0, 1].map((i) => (
          <Skeleton key={i} height={220} width="46%" />
        ))}
      </View>
    </View>
  )
}

export default function StoreScreen() {
  const router = useRouter()
  const { id: rawId } = useLocalSearchParams()
  const id = Array.isArray(rawId) ? rawId[0] : rawId
  const valid = isObjectId(id)
  // A malformed id is answered here, without asking the server.
  const storefront = useRemote(`storefront:${id}`, () =>
    valid ? fetchStorefront(id) : Promise.reject(Object.assign(new Error('bad id'), { response: { status: 400, data: {} } })),
  )
  const gone = storefront.httpStatus === 404 || storefront.httpStatus === 400
  const ready = storefront.status === 'ready' && Boolean(storefront.data)

  const shop = {
    shop: () => router.navigate(nearbyHref({ q: storefront.data?.store?.name || storefront.data?.brand?.name || '' })),
    refresh: storefront.reload,
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flex: 1 }}>
        {storefront.status === 'loading' ? (
          <StoreSkeleton />
        ) : storefront.status === 'error' ? (
          <View style={{ padding: spacing.lg }}>
            <EmptyState
              icon={gone ? 'shopping-bag' : 'wifi-off'}
              tone={gone ? 'default' : 'error'}
              title={gone ? 'This store is not available' : "Couldn't load this store"}
              message={gone ? 'It may have closed, or the link is wrong.' : storefront.error}
              action={
                gone ? (
                  <Button title="Browse stores near you" onPress={() => router.navigate('/nearby')} />
                ) : (
                  <Button title="Try again" onPress={storefront.reload} />
                )
              }
            />
          </View>
        ) : (
          <StoreView data={storefront.data} onShop={shop} refreshing={storefront.refreshing} />
        )}

        <View style={{ position: 'absolute', top: spacing.sm, left: spacing.lg, zIndex: 10 }}>
          <BackButton onDark={ready} />
        </View>
      </View>
    </SafeAreaView>
  )
}
