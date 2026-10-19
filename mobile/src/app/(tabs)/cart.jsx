import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import QuantityStepper from '../../components/ui/QuantityStepper'
import Screen from '../../components/ui/Screen'
import Skeleton from '../../components/ui/Skeleton'
import ProductImage from '../../components/ProductImage'
import RequireCustomer from '../../components/RequireCustomer'
import { useAuth } from '../../hooks/useAuth'
import { useCart } from '../../hooks/useCart'
import { useRemote } from '../../hooks/useRemote'
import { cartHasIssues, cartIsEmpty, clampQuantity, fetchCart, issueText, MAX_CART_QTY, removeFromCart, setCartQuantity } from '../../services/cart'
import { getErrorMessage } from '../../services/api'
import { formatPrice } from '../../utils/format'
import { colors, radius, spacing } from '../../theme'

function CartLine({ item, busy, onQuantity, onRemove, onOpen }) {
  const issue = issueText(item)
  const name = item.name || 'Unavailable product'
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.lg }}>
      <Pressable onPress={onOpen} accessibilityRole="link" accessibilityLabel={`Open ${name}`}>
        <ProductImage src={item.image} name={name} width={80} style={{ width: 80, height: 100, borderRadius: radius.md }} />
      </Pressable>
      <View style={{ flex: 1, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <AppText variant="label" numberOfLines={2} style={{ fontSize: 14, lineHeight: 19 }}>
              {name}
            </AppText>
            <AppText variant="small">{item.unitPrice != null ? `${formatPrice(item.unitPrice)} each` : '—'}</AppText>
            {issue ? (
              <AppText variant="small" style={{ color: colors.clay, fontFamily: 'Poppins_500Medium' }}>
                {issue}
              </AppText>
            ) : null}
          </View>
          <AppText variant="strong">{formatPrice(item.lineTotal)}</AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <QuantityStepper value={item.quantity} max={MAX_CART_QTY} disabled={busy} label={name} onChange={(q) => onQuantity(clampQuantity(q))} />
          <Pressable
            onPress={onRemove}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${name}`}
            hitSlop={8}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.4 : 1 }}
          >
            <Feather name="trash-2" size={19} color={colors.muted} />
          </Pressable>
        </View>
      </View>
    </View>
  )
}

export default function CartScreen() {
  const router = useRouter()
  const { status, user } = useAuth()
  const { setCount } = useCart()
  const signedIn = status === 'signedIn' && user?.role === 'CUSTOMER'

  const remote = useRemote(`cart:${signedIn ? user.id : 'none'}`, () => (signedIn ? fetchCart() : Promise.resolve(null)))
  // The server answers every change with the fresh cart. It is shown until a newer read replaces it.
  const [changed, setChanged] = useState(null)
  const cart = changed && changed.base === remote.data ? changed.cart : remote.data
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState('')

  // Coming back to this tab (after adding something on a product page) shows the current cart.
  const firstFocus = useRef(true)
  const { reload } = remote
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false
        return
      }
      reload()
    }, [reload]),
  )

  // The badge on the tab follows every fresh read of the cart (changes made here update it directly, below).
  const serverCount = remote.data?.itemCount
  useEffect(() => {
    if (serverCount !== undefined) setCount(serverCount)
  }, [serverCount, setCount])

  async function change(productId, request) {
    setBusyId(productId)
    setNotice('')
    try {
      const next = await request()
      setChanged({ base: remote.data, cart: next })
      setCount(next.itemCount)
    } catch (err) {
      setNotice(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const refresh = () => {
    setChanged(null)
    reload()
  }

  const hasIssues = cartHasIssues(cart)

  return (
    <Screen title="Cart" subtitle={cart && !cartIsEmpty(cart) ? `${cart.itemCount} ${cart.itemCount === 1 ? 'item' : 'items'}` : undefined} onRefresh={signedIn ? refresh : undefined} refreshing={remote.refreshing}>
      <RequireCustomer next="/cart" icon="shopping-cart" title="Sign in to see your cart" message="Your cart is saved to your account, so it is waiting for you on any device.">
        {remote.status === 'loading' ? (
          <View style={{ gap: spacing.lg }}>
            <Skeleton height={130} />
            <Skeleton height={130} />
          </View>
        ) : remote.status === 'error' ? (
          <EmptyState icon="wifi-off" tone="error" title="Couldn't load your cart" message={remote.error} action={<Button title="Try again" onPress={refresh} />} />
        ) : cartIsEmpty(cart) ? (
          <EmptyState icon="shopping-bag" title="Your cart is empty" message="Browse the shops in your city and add what you like." action={<Button title="Start shopping" onPress={() => router.navigate('/shop')} />} />
        ) : (
          <View style={{ gap: spacing.lg }}>
            {notice ? (
              <View accessibilityRole="alert" style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md }}>
                <AppText variant="small" style={{ color: colors.danger }}>
                  {notice}
                </AppText>
              </View>
            ) : null}

            {cart.groups.map((group) => (
              <View key={group.brand._id} style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: 'hidden' }}>
                <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                  <AppText variant="small" style={{ textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 11 }}>
                    {group.brand.name || 'Brand'}
                  </AppText>
                </View>
                {group.items.map((item, i) => (
                  <View key={item.productId} style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.line } : undefined}>
                    <CartLine
                      item={item}
                      busy={busyId === item.productId}
                      onQuantity={(q) => change(item.productId, () => setCartQuantity(item.productId, q))}
                      onRemove={() => change(item.productId, () => removeFromCart(item.productId))}
                      onOpen={() => router.push(`/product/${item.productId}`)}
                    />
                  </View>
                ))}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.line }}>
                  <AppText variant="small">{group.brand.name} subtotal</AppText>
                  <AppText variant="strong">{formatPrice(group.subtotal)}</AppText>
                </View>
              </View>
            ))}

            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="small">Items</AppText>
                <AppText variant="body">{cart.itemCount}</AppText>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line }}>
                <AppText variant="strong">Subtotal</AppText>
                <AppText variant="strong">{formatPrice(cart.subtotal)}</AppText>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                <Feather name="dollar-sign" size={16} color={colors.muted} style={{ marginTop: 2 }} />
                <AppText variant="small" style={{ flex: 1, fontSize: 12 }}>
                  Each brand prepares and delivers its own order. You pay in cash on delivery.
                </AppText>
              </View>
              {hasIssues ? (
                <View style={{ marginTop: spacing.lg, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md }}>
                  <AppText variant="small" style={{ color: colors.danger }}>
                    Remove or fix the items marked above to continue.
                  </AppText>
                </View>
              ) : (
                <Button title="Checkout" onPress={() => router.push('/checkout')} style={{ marginTop: spacing.lg }} />
              )}
            </Card>
          </View>
        )}
      </RequireCustomer>
    </Screen>
  )
}
