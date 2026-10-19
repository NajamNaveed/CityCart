import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import QuantityStepper from '../../components/ui/QuantityStepper'
import Skeleton from '../../components/ui/Skeleton'
import BackButton from '../../components/BackButton'
import { BrandLogo } from '../../components/BrandCard'
import ExpandableText from '../../components/ExpandableText'
import ImageGallery from '../../components/ImageGallery'
import ReviewsSection from '../../components/ReviewsSection'
import Stars from '../../components/Stars'
import { useAuth } from '../../hooks/useAuth'
import { useCart } from '../../hooks/useCart'
import { useRemote } from '../../hooks/useRemote'
import { getErrorMessage } from '../../services/api'
import { fetchProduct, fetchReviews } from '../../services/catalog'
import { clampQuantity, MAX_PRODUCT_QTY } from '../../services/cart'
import { formatPrice } from '../../utils/format'
import { isObjectId } from '../../utils/ids'
import { loginHref, shopHref } from '../../utils/nav'
import { availabilityInfo, discountPercent } from '../../utils/product'
import { colors, radius, spacing } from '../../theme'

const TONES = { good: colors.success, warn: colors.warning, bad: colors.danger }

/**
 * Quantity and "Add to cart", pinned to the bottom of the product page. A visitor who is not signed in
 * is sent to sign in and comes straight back; the page then adds what they had chosen (`resumeQty`).
 */
function AddToCartBar({ product, resumeQty }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { addItem } = useCart()
  const [quantity, setQuantity] = useState(1)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null) // { text, tone }
  const resumed = useRef(false)
  const soldOut = availabilityInfo(product).soldOut
  const isCustomer = user?.role === 'CUSTOMER'

  async function add(count) {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      await addItem(product._id, count)
      setNotice({ text: `Added ${count > 1 ? `${count} to` : 'to'} your cart.`, tone: 'good' })
    } catch (err) {
      setNotice({ text: getErrorMessage(err, "Couldn't add this to your cart."), tone: 'bad' })
    } finally {
      setBusy(false)
    }
  }

  // Back from signing in with an add waiting: do it once, then clear it from the address.
  useEffect(() => {
    if (!resumeQty || !isCustomer || resumed.current || soldOut) return undefined
    resumed.current = true
    const count = clampQuantity(resumeQty, MAX_PRODUCT_QTY)
    router.setParams({ add: '' })
    const timer = setTimeout(() => {
      setQuantity(count)
      add(count)
    }, 0)
    return () => clearTimeout(timer)
    // add() only reads state through its own closure; this should run once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeQty, isCustomer, soldOut])

  const onPress = () => {
    if (!user) router.push(loginHref(`/product/${product._id}?add=${quantity}`))
    else add(quantity)
  }

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: Math.max(insets.bottom, spacing.md), gap: spacing.sm }}>
      {notice ? (
        <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <AppText variant="small" style={{ flex: 1, color: notice.tone === 'good' ? colors.success : colors.danger }}>
            {notice.text}
          </AppText>
          {notice.tone === 'good' ? (
            <Pressable onPress={() => router.navigate('/cart')} accessibilityRole="button" hitSlop={8} style={{ minHeight: 36, justifyContent: 'center' }}>
              <AppText variant="label" style={{ color: colors.clay }}>
                View cart
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        {soldOut ? null : <QuantityStepper value={quantity} max={MAX_PRODUCT_QTY} disabled={busy} label={product.name} onChange={(q) => setQuantity(clampQuantity(q, MAX_PRODUCT_QTY))} />}
        <View style={{ flex: 1 }}>
          <Button title={soldOut ? 'Sold out' : user ? 'Add to cart' : 'Sign in to add to cart'} onPress={onPress} loading={busy} disabled={soldOut} variant="clay" />
        </View>
      </View>
    </View>
  )
}

function ProductView({ product, brand, resumeQty }) {
  const router = useRouter()
  const stock = availabilityInfo(product)
  const discount = discountPercent(product)
  // Only the summary is needed here (stars under the title); the full list loads in the reviews section.
  const rating = useRemote(`rating:${product._id}`, () => fetchReviews(product._id, 1))
  const summary = rating.data?.summary
  const details = Object.entries(product.attributes || {}).filter(([, v]) => v !== '' && v != null)

  return (
    <>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <ImageGallery images={product.images || []} name={product.name} />

      <View style={{ padding: spacing.lg }}>
        {brand ? (
          <Pressable
            onPress={() => router.navigate(shopHref({ brandId: brand._id }))}
            accessibilityRole="button"
            accessibilityLabel={`${brand.name}, see all products`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start', minHeight: 44 }}
          >
            <BrandLogo brand={brand} size={28} />
            <AppText variant="label" style={{ color: colors.clay }}>
              {brand.name}
            </AppText>
          </Pressable>
        ) : null}

        <AppText variant="heading" accessibilityRole="header" style={{ fontSize: 26, lineHeight: 32, marginTop: spacing.xs }}>
          {product.name}
        </AppText>

        {summary && summary.count > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
            <Stars value={summary.average} size={16} />
            <AppText variant="small">
              {summary.average.toFixed(1)} ({summary.count} {summary.count === 1 ? 'review' : 'reviews'})
            </AppText>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.md }}>
          <AppText variant="title" style={{ fontSize: 28 }}>
            {formatPrice(product.price)}
          </AppText>
          {discount > 0 ? (
            <>
              <AppText variant="small" style={{ textDecorationLine: 'line-through', fontSize: 15 }}>
                {formatPrice(product.compareAtPrice)}
              </AppText>
              <View style={{ backgroundColor: colors.clay, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 }}>
                <AppText variant="small" style={{ color: colors.white, fontSize: 12 }}>
                  {discount}% off
                </AppText>
              </View>
            </>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: TONES[stock.tone] }} />
          <AppText variant="label" style={{ color: TONES[stock.tone] }}>
            {stock.label}
          </AppText>
        </View>

        {product.description ? (
          <View style={{ marginTop: spacing.lg }}>
            <ExpandableText text={product.description} />
          </View>
        ) : null}

        {details.length > 0 || product.sku ? (
          <View style={{ marginTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line }}>
            {[...details, ...(product.sku ? [['SKU', product.sku]] : [])].map(([label, value]) => (
              <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                <AppText variant="small">{label}</AppText>
                <AppText variant="label" style={{ flexShrink: 1, textAlign: 'right' }}>
                  {String(value)}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <ReviewsSection productId={product._id} />
    </ScrollView>
    <AddToCartBar product={product} resumeQty={resumeQty} />
    </>
  )
}

export default function ProductScreen() {
  const { id: rawId, add } = useLocalSearchParams()
  const id = Array.isArray(rawId) ? rawId[0] : rawId
  const resumeQty = Number(Array.isArray(add) ? add[0] : add) || 0
  const valid = isObjectId(id)
  // A malformed id is answered here, without asking the server.
  const product = useRemote(`product:${id}`, () => (valid ? fetchProduct(id) : Promise.reject(Object.assign(new Error('bad id'), { response: { status: 400, data: {} } }))))

  const gone = product.httpStatus === 404 || product.httpStatus === 400

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <BackButton />
      </View>

      {product.status === 'loading' ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton height={320} />
          <Skeleton height={22} width="70%" />
          <Skeleton height={22} width="35%" />
          <Skeleton height={80} />
        </View>
      ) : product.status === 'error' ? (
        <View style={{ padding: spacing.lg }}>
          <EmptyState
            icon={gone ? 'package' : 'wifi-off'}
            tone={gone ? 'default' : 'error'}
            title={gone ? 'This product is not available' : "Couldn't load this product"}
            message={gone ? 'It may have been removed by the seller.' : product.error}
            action={gone ? undefined : <Button title="Try again" onPress={product.reload} />}
          />
        </View>
      ) : (
        <ProductView key={product.data.product._id} product={product.data.product} brand={product.data.brand} resumeQty={resumeQty} />
      )}
    </SafeAreaView>
  )
}
