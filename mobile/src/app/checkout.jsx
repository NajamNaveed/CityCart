import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../components/ui/AppText'
import AreaMap from '../components/AreaMap'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import TextField from '../components/ui/TextField'
import BackButton from '../components/BackButton'
import RequireCustomer from '../components/RequireCustomer'
import { useAuth } from '../hooks/useAuth'
import { useCart } from '../hooks/useCart'
import { useCity } from '../hooks/useCity'
import { useNearby } from '../hooks/useNearby'
import { useRemote } from '../hooks/useRemote'
import { getErrorMessage, getFieldErrors } from '../services/api'
import { fetchAddresses, formFromAddress } from '../services/addresses'
import { resolveAt } from '../services/nearby'
import { cartHasIssues, cartIsEmpty, fetchCart } from '../services/cart'
import { checkoutFieldErrors, countWords, deliveryProblem, fetchPaymentMethods, MAX_NOTE_WORDS, placeOrder, rememberPlacedOrders, validateCheckout } from '../services/orders'
import { sentenceAll } from '../utils/validation'
import { formatPrice } from '../utils/format'
import { colors, fonts, minTouch, radius, spacing } from '../theme'

function CheckoutForm({ cart }) {
  const router = useRouter()
  const { user } = useAuth()
  const { city } = useCity()
  const { blocks, blocksReady, coords: areaCoords } = useNearby()
  const { setCount } = useCart()

  const scroller = useRef(null)
  const placing = useRef(false) // blocks a second tap while the first order is still being placed
  const phoneRef = useRef(null)
  const addressRef = useRef(null)
  const cityRef = useRef(null)
  const postalRef = useRef(null)
  const notesRef = useRef(null)
  const [form, setForm] = useState({
    fullName: user?.name || '',
    phone: '',
    addressLine: '',
    city: city?.name || '',
    postalCode: '',
    additionalInstructions: '',
  })
  // Saved addresses. `selectedId`: null = the default one, '' = a new address, else a saved id.
  const [addresses, setAddresses] = useState(null) // null while loading
  const [selectedId, setSelectedId] = useState(null)
  // The delivery pin for a NEW address, and which blocks hold it (answered by the server).
  const [pin, setPin] = useState(areaCoords)
  const [pinInfo, setPinInfo] = useState({ key: '', blocks: [], error: '' })
  const [saveIt, setSaveIt] = useState(true)
  const [label, setLabel] = useState('Home')
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Cash is always offered; paying online appears only while the server has a gateway on.
  const offered = useRemote('payment-methods', fetchPaymentMethods)
  const methods = offered.status === 'ready' && Array.isArray(offered.data) && offered.data.length ? offered.data : [{ method: 'COD', label: 'Cash on delivery' }]
  const [chosen, setChosen] = useState('COD')
  const method = methods.some((m) => m.method === chosen) ? chosen : 'COD'

  useEffect(() => {
    let active = true
    fetchAddresses()
      .then((list) => {
        if (!active) return
        setAddresses(list)
        const first = list.find((a) => a.isDefault) || list[0]
        // The saved address brings its standing delivery notes along.
        if (first?.additionalInstructions) setForm((f) => formFromAddress(first, f))
      })
      .catch(() => active && setAddresses([]))
    return () => {
      active = false
    }
  }, [])

  const savedList = addresses || []
  const chosenAddress =
    selectedId === '' ? null : savedList.find((a) => a._id === selectedId) || (selectedId === null ? savedList.find((a) => a.isDefault) || savedList[0] || null : null)
  const useSaved = Boolean(chosenAddress)
  const deliveryPin = useSaved ? { lat: chosenAddress.latitude, lng: chosenAddress.longitude } : pin

  const pinKey = !useSaved && pin ? `${pin.lat},${pin.lng}` : ''
  useEffect(() => {
    if (!pinKey) return undefined
    let active = true
    const [lat, lng] = pinKey.split(',').map(Number)
    resolveAt({ lat, lng }).then((result) => active && setPinInfo({ key: pinKey, blocks: result.containing || [], error: result.status === 'error' ? 'We could not check that spot. Try again.' : '' }))
    return () => {
      active = false
    }
  }, [pinKey])
  const pinChecked = pinInfo.key === pinKey
  const pinOutside = !useSaved && Boolean(pinKey) && pinChecked && !pinInfo.error && pinInfo.blocks.length === 0
  const needsPin = !useSaved && (!pin || pinOutside)

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }))
  const words = countWords(form.additionalInstructions)
  const hasIssues = cartHasIssues(cart)

  async function onSubmit() {
    if (placing.current) return
    const problems = validateCheckout(form, { savedAddress: useSaved })
    setErrors(problems)
    setBanner('')
    if (Object.keys(problems).length > 0) {
      setBanner('Please check the highlighted fields.')
      scroller.current?.scrollTo({ y: 0, animated: true })
      return
    }
    if (!deliveryPin || needsPin) {
      setBanner('Tap the map to mark where we should deliver, inside a shaded area.')
      scroller.current?.scrollTo({ y: 0, animated: true })
      return
    }

    placing.current = true
    setSubmitting(true)
    try {
      const orders = await placeOrder(useSaved ? formFromAddress(chosenAddress, form) : form, method, {
        pin: deliveryPin,
        ...(useSaved ? { addressId: chosenAddress._id } : saveIt && { saveAs: label.trim() || 'Home' }),
      })
      setCount(0)
      rememberPlacedOrders(orders)
      router.replace('/order-placed')
    } catch (err) {
      setErrors(sentenceAll(checkoutFieldErrors(getFieldErrors(err))))
      setBanner(deliveryProblem(err) || getErrorMessage(err))
      scroller.current?.scrollTo({ y: 0, animated: true })
      placing.current = false
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroller} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        {banner ? (
          <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg }}>
            <AppText variant="small" style={{ color: colors.danger }}>
              {banner}
            </AppText>
          </View>
        ) : null}

        <AppText variant="heading" accessibilityRole="header" style={{ marginBottom: spacing.md }}>
          Delivery address
        </AppText>
        {savedList.length > 0 ? (
          <View accessibilityRole="radiogroup" accessibilityLabel="Saved addresses" style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
            {savedList.map((a) => {
              const on = chosenAddress?._id === a._id
              return (
                <Pressable
                  key={a._id}
                  onPress={() => {
                    setSelectedId(a._id)
                    setForm((f) => formFromAddress(a, f))
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${a.label}${a.isDefault ? ', default' : ''}: ${a.addressLine}`}
                >
                  <Card style={{ gap: 2, borderColor: on ? colors.ink : colors.line }}>
                    <AppText variant="strong">
                      {a.label}
                      {a.isDefault ? <AppText variant="small">{'  Default'}</AppText> : null}
                    </AppText>
                    <AppText variant="small">
                      {a.fullName} · {a.phone}
                    </AppText>
                    <AppText variant="small">
                      {a.addressLine}, {a.city}
                    </AppText>
                    {a.blocks.length > 0 ? (
                      <AppText variant="small" style={{ color: colors.clay }}>
                        {a.blocks.map((b) => b.name).join(' + ')}
                      </AppText>
                    ) : null}
                  </Card>
                </Pressable>
              )
            })}
            <Pressable onPress={() => setSelectedId('')} accessibilityRole="radio" accessibilityState={{ selected: !useSaved }}>
              <Card style={{ borderColor: !useSaved ? colors.ink : colors.line }}>
                <AppText variant="strong">Deliver to a new address</AppText>
              </Card>
            </Pressable>
          </View>
        ) : null}
        {!useSaved ? (
          <>
          <TextField
          label="Full name"
          value={form.fullName}
          onChangeText={set('fullName')}
          error={errors.fullName}
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={() => phoneRef.current?.focus()}
          style={{ marginBottom: spacing.lg }}
        />
          <TextField
          ref={phoneRef}
          label="Phone"
          value={form.phone}
          onChangeText={set('phone')}
          error={errors.phone}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder="+92 300 1234567"
          returnKeyType="next"
          onSubmitEditing={() => addressRef.current?.focus()}
          style={{ marginBottom: spacing.lg }}
        />
          <TextField
          ref={addressRef}
          label="Street address"
          value={form.addressLine}
          onChangeText={set('addressLine')}
          error={errors.addressLine}
          autoComplete="street-address"
          textContentType="streetAddressLine1"
          returnKeyType="next"
          onSubmitEditing={() => cityRef.current?.focus()}
          style={{ marginBottom: spacing.lg }}
        />
          <TextField
          ref={cityRef}
          label="City"
          value={form.city}
          onChangeText={set('city')}
          error={errors.city}
          autoCapitalize="words"
          textContentType="addressCity"
          returnKeyType="next"
          onSubmitEditing={() => postalRef.current?.focus()}
          style={{ marginBottom: spacing.lg }}
        />
          <TextField
          ref={postalRef}
          label="Postal code (optional)"
          value={form.postalCode}
          onChangeText={set('postalCode')}
          error={errors.postalCode}
          keyboardType="number-pad"
          textContentType="postalCode"
          returnKeyType="next"
          onSubmitEditing={() => notesRef.current?.focus()}
          style={{ marginBottom: spacing.lg }}
        />


            <View style={{ marginBottom: spacing.lg, gap: spacing.sm }}>
              <AppText variant="label">Delivery spot on the map</AppText>
              <AppText variant="small">Tap where we should deliver. Shaded areas are where we deliver. Only stores in that area will deliver to you.</AppText>
              {blocksReady && blocks.length > 0 ? (
                <AreaMap
                  zones={blocks}
                  selectedIds={pinChecked ? pinInfo.blocks.map((b) => b._id) : []}
                  pin={pin}
                  height={260}
                  onPick={(lat, lng) => setPin({ lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 })}
                  label="Map for choosing the delivery spot"
                />
              ) : (
                <Skeleton height={260} />
              )}
              <AppText variant="small" accessibilityLiveRegion="polite" style={{ color: pinOutside || pinInfo.error ? colors.clay : colors.muted }}>
                {!pin
                  ? 'No spot chosen yet.'
                  : !pinChecked
                    ? 'Checking the spot…'
                    : pinInfo.error
                      ? pinInfo.error
                      : pinOutside
                        ? 'We do not deliver there yet. Tap inside a shaded area.'
                        : `Delivering to ${pinInfo.blocks.map((b) => b.name).join(' + ')}`}
              </AppText>
            </View>
            <Pressable onPress={() => setSaveIt((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: saveIt }} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 }}>
              <Feather name={saveIt ? 'check-square' : 'square'} size={22} color={saveIt ? colors.ink : colors.muted} />
              <AppText variant="body">Save this address for next time</AppText>
            </Pressable>
            {saveIt ? <TextField label="Name this address" value={label} onChangeText={setLabel} maxLength={40} style={{ marginBottom: spacing.lg }} /> : null}
          </>
        ) : null}

        <View style={{ marginBottom: spacing.xl }}>
          <AppText variant="label" style={{ marginBottom: spacing.xs }}>
            Delivery notes
          </AppText>
          <View style={{ borderWidth: 1, borderColor: errors.additionalInstructions ? colors.danger : colors.line, borderRadius: radius.md, backgroundColor: colors.surface }}>
            <FieldNotes value={form.additionalInstructions} onChange={set('additionalInstructions')} inputRef={notesRef} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs, gap: spacing.md }}>
            <AppText variant="small" accessibilityLiveRegion="polite" style={{ flex: 1, color: errors.additionalInstructions ? colors.danger : colors.muted }}>
              {errors.additionalInstructions || 'Landmarks, gate colour, when to call. The courier reads this.'}
            </AppText>
            <AppText variant="small" style={{ color: words > MAX_NOTE_WORDS ? colors.danger : colors.muted }}>
              {words}/{MAX_NOTE_WORDS}
            </AppText>
          </View>
        </View>

        <AppText variant="heading" accessibilityRole="header" style={{ marginBottom: spacing.md }}>
          Payment
        </AppText>
        <View style={{ marginBottom: spacing.xl, gap: spacing.md }}>
          {methods.map((m) => {
            const online = m.method === 'ONLINE_GATEWAY'
            const selected = method === m.method
            return (
              <Pressable
                key={m.method}
                onPress={() => setChosen(m.method)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={online ? m.label : 'Cash on delivery'}
              >
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderColor: selected ? colors.ink : colors.line }}>
                  <Feather name={online ? 'credit-card' : 'dollar-sign'} size={20} color={colors.clay} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="strong">{online ? m.label : 'Cash on delivery'}</AppText>
                    <AppText variant="small">
                      {online
                        ? `Pay now. Your order is held for ${m.holdMinutes} minutes while you pay; if it is not paid by then it is cancelled.`
                        : 'Pay the courier when your order arrives.'}
                    </AppText>
                  </View>
                  <Feather name={selected ? 'check-circle' : 'circle'} size={20} color={selected ? colors.success : colors.muted} />
                </Card>
              </Pressable>
            )
          })}
        </View>

        <AppText variant="heading" accessibilityRole="header" style={{ marginBottom: spacing.md }}>
          Your order
        </AppText>
        <Card style={{ marginBottom: spacing.xl, gap: spacing.sm }}>
          {cart.groups.map((group) => (
            <View key={group.brand._id}>
              <AppText variant="small" style={{ textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 11, marginBottom: 4 }}>
                {group.brand.name}
              </AppText>
              {group.items.map((item) => (
                <View key={item.productId} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginBottom: 4 }}>
                  <AppText variant="small" numberOfLines={1} style={{ flex: 1, color: colors.ink }}>
                    {item.quantity} × {item.name}
                  </AppText>
                  <AppText variant="small" style={{ color: colors.ink }}>
                    {formatPrice(item.lineTotal)}
                  </AppText>
                </View>
              ))}
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md, marginTop: spacing.xs }}>
            <AppText variant="strong">Total to pay</AppText>
            <AppText variant="strong">{formatPrice(cart.subtotal)}</AppText>
          </View>
          {cart.groups.length > 1 ? (
            <AppText variant="small" style={{ fontSize: 12 }}>
              Your cart has {cart.groups.length} brands, so it becomes {cart.groups.length} separate orders.
            </AppText>
          ) : null}
        </Card>

        {hasIssues ? (
          <EmptyState icon="alert-triangle" tone="error" title="Some items need attention" message="One or more items in your cart are unavailable. Fix your cart to place the order." action={<Button title="Back to cart" onPress={() => router.replace('/cart')} />} />
        ) : (
          <Button title={`Place order · ${formatPrice(cart.subtotal)}`} onPress={onSubmit} loading={submitting} disabled={needsPin} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// The multi-line notes box (a plain TextInput inside a bordered frame).
function FieldNotes({ value, onChange, inputRef }) {
  return (
    <TextInput
      ref={inputRef}
      value={value}
      onChangeText={onChange}
      multiline
      numberOfLines={4}
      textAlignVertical="top"
      accessibilityLabel="Delivery notes"
      placeholder="e.g. Blue gate, second floor. Please call when you arrive."
      placeholderTextColor={colors.muted}
      style={{ minHeight: minTouch * 2, padding: spacing.md, fontFamily: fonts.regular, fontSize: 16, color: colors.ink }}
    />
  )
}

export default function Checkout() {
  const { status, user } = useAuth()
  const signedIn = status === 'signedIn' && user?.role === 'CUSTOMER'
  const remote = useRemote(`checkout:${signedIn ? user.id : 'none'}`, () => (signedIn ? fetchCart() : Promise.resolve(null)))

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <BackButton />
        <AppText variant="heading" accessibilityRole="header">
          Checkout
        </AppText>
      </View>
      <RequireCustomer next="/checkout" icon="lock" title="Sign in to check out" message="We need your account to place the order and keep track of it for you.">
        {remote.status === 'loading' ? (
          <View style={{ padding: spacing.lg, gap: spacing.lg }}>
            <Skeleton height={56} />
            <Skeleton height={56} />
            <Skeleton height={56} />
          </View>
        ) : remote.status === 'error' ? (
          <View style={{ padding: spacing.lg }}>
            <EmptyState icon="wifi-off" tone="error" title="Couldn't load your cart" message={remote.error} action={<Button title="Try again" onPress={remote.reload} />} />
          </View>
        ) : cartIsEmpty(remote.data) ? (
          <Redirect href="/cart" />
        ) : (
          <CheckoutForm cart={remote.data} />
        )}
      </RequireCustomer>
    </SafeAreaView>
  )
}
