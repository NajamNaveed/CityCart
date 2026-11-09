import { useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../components/ui/AppText'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import TextField from '../components/ui/TextField'
import BackButton from '../components/BackButton'
import RequireCustomer from '../components/RequireCustomer'
import NearbyMap from '../components/NearbyMap'
import { useAuth } from '../hooks/useAuth'
import { useCart } from '../hooks/useCart'
import { useCity } from '../hooks/useCity'
import { useNearby } from '../hooks/useNearby'
import { useRemote } from '../hooks/useRemote'
import { getErrorMessage, getFieldErrors } from '../services/api'
import { fetchAddresses } from '../services/addresses'
import { cartHasIssues, cartIsEmpty, fetchCart } from '../services/cart'
import { resolvePoint } from '../services/nearby'
import { checkoutFieldErrors, countWords, MAX_NOTE_WORDS, placeOrder, rememberPlacedOrders, validateCheckout } from '../services/orders'
import { sentenceAll } from '../utils/validation'
import { formatPrice } from '../utils/format'
import { colors, fonts, minTouch, radius, spacing } from '../theme'

function SavedAddress({ address, selected, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${address.label}${address.isDefault ? ', default' : ''}`}>
      <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, borderColor: selected ? colors.ink : colors.line, borderWidth: selected ? 2 : 1 }}>
        <Feather name={selected ? 'check-circle' : 'circle'} size={20} color={selected ? colors.ink : colors.muted} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <AppText variant="strong" numberOfLines={1} style={{ flex: 1 }}>
              {address.label}
            </AppText>
            {address.isDefault ? (
              <AppText variant="small" style={{ flexShrink: 0 }}>
                Default
              </AppText>
            ) : null}
          </View>
          <AppText variant="small" style={{ color: colors.ink }}>
            {address.fullName} · {address.phone}
          </AppText>
          <AppText variant="small">
            {address.addressLine}, {address.city}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs }}>
            <Feather name="map-pin" size={12} color={colors.clay} style={{ marginTop: 2 }} />
            <AppText variant="small" style={{ color: colors.clay, flex: 1 }}>
              {address.blocks?.length ? address.blocks.map((b) => b.name).join(' + ') : 'No longer inside a delivery area'}
            </AppText>
          </View>
        </View>
      </Card>
    </Pressable>
  )
}

function CheckoutForm({ cart }) {
  const router = useRouter()
  const { user } = useAuth()
  const { city } = useCity()
  const { blocks, blocksReady, origin } = useNearby()
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
  })
  // Notes are required. Until the shopper writes their own, they follow the saved address.
  const [typedNotes, setTypedNotes] = useState('')
  const [notesTouched, setNotesTouched] = useState(false)
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Saved addresses. `selectedId`: null = the default one, '' = a new address, else a saved id.
  const addresses = useRemote(`checkout-addresses:${user?.id}`, fetchAddresses)
  const savedList = addresses.data || []
  const [selectedId, setSelectedId] = useState(null)
  const picked = selectedId === '' ? null : savedList.find((a) => a._id === selectedId) || (selectedId === null ? savedList.find((a) => a.isDefault) || savedList[0] || null : null)
  const useSaved = Boolean(picked)

  // The delivery pin for a new address, and which blocks hold it (answered by the server).
  // Until the shopper taps the map, it starts at the centre of their area.
  const [pickedPin, setPickedPin] = useState(null)
  const pin = pickedPin || (origin ? { lat: origin.lat, lng: origin.lng } : null)
  const [saveIt, setSaveIt] = useState(true)
  const [label, setLabel] = useState('Home')

  // A saved address brings its standing delivery notes along, unless the shopper wrote their own.
  const pickedNotes = picked?.additionalInstructions || ''
  const notes = notesTouched ? typedNotes : pickedNotes

  const pinKey = !useSaved && pin ? `${pin.lat},${pin.lng}` : ''
  const pinRemote = useRemote(`checkout-pin:${pinKey || 'saved'}`, () => (pinKey ? resolvePoint(pin) : Promise.resolve({ containing: [], nearest: [] })))
  const containing = pinKey && pinRemote.status === 'ready' ? pinRemote.data?.containing || [] : []
  const pinOutside = Boolean(pinKey) && pinRemote.status === 'ready' && containing.length === 0
  const deliveryPin = useSaved ? { lat: picked.latitude, lng: picked.longitude } : pin

  const set = (field) => (value) => {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }
  const setNotes = (value) => {
    setTypedNotes(value)
    setNotesTouched(true)
    setErrors((e) => ({ ...e, additionalInstructions: undefined }))
  }
  const chooseSaved = (address) => setSelectedId(address._id)

  const words = countWords(notes)
  const hasIssues = cartHasIssues(cart)
  // What the server will receive as the address: the saved one, or what was typed.
  const shippingForm = useSaved
    ? { fullName: picked.fullName, phone: picked.phone, addressLine: picked.addressLine, city: picked.city, postalCode: picked.postalCode || '', additionalInstructions: notes }
    : { ...form, additionalInstructions: notes }

  async function onSubmit() {
    if (placing.current) return
    setBanner('')
    const problems = validateCheckout(shippingForm)

    let pinProblem = ''
    if (!useSaved) {
      if (!pin) pinProblem = 'Tap the map to mark where we should deliver.'
      else if (pinRemote.status === 'error') pinProblem = pinRemote.error || 'We could not check that spot. Try again.'
      else if (pinRemote.status === 'loading') pinProblem = 'Checking the delivery spot… try again in a moment.'
      else if (pinOutside) pinProblem = 'We do not deliver to that spot yet. Tap inside a shaded area.'
    }

    setErrors(problems)
    if (Object.keys(problems).length > 0 || pinProblem) {
      setBanner(pinProblem || problems.additionalInstructions || 'Please check the highlighted fields.')
      scroller.current?.scrollTo({ y: 0, animated: true })
      return
    }

    placing.current = true
    setSubmitting(true)
    try {
      const orders = await placeOrder(shippingForm, 'COD', {
        pin: deliveryPin,
        ...(useSaved ? { addressId: picked._id } : saveIt && { saveLabel: label.trim() || 'Home' }),
      })
      setCount(0)
      rememberPlacedOrders(orders)
      router.replace('/order-placed')
    } catch (err) {
      setErrors(sentenceAll(checkoutFieldErrors(getFieldErrors(err))))
      const data = err.response?.data
      const notDeliverable = (data?.issues || []).filter((i) => i.code === 'NOT_DELIVERABLE')
      if (notDeliverable.length > 0) {
        const stores = [...new Set(notDeliverable.map((i) => i.brandName).filter(Boolean))]
        setBanner(`${stores.length ? stores.join(' and ') : 'Some stores'} cannot deliver to this spot. Choose another delivery spot, or remove those items from your cart.`)
      } else if (data?.code === 'CHECKOUT_ISSUES') {
        setBanner('Some items in your cart changed while you were checking out. Please review your cart.')
      } else if (data?.code === 'OUTSIDE_DELIVERY_ZONE') {
        setBanner('We do not deliver to that spot yet. Tap inside a shaded area on the map.')
      } else if (data?.code === 'ADDRESS_NOT_FOUND') {
        setBanner('That saved address no longer exists. Choose another address or deliver somewhere new.')
      } else {
        setBanner(getErrorMessage(err))
      }
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
            {banner.includes('review your cart') ? (
              <Pressable onPress={() => router.replace('/cart')} accessibilityRole="link" hitSlop={8} style={{ marginTop: spacing.sm }}>
                <AppText variant="label" style={{ color: colors.danger }}>
                  Go to cart
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <AppText variant="heading" accessibilityRole="header" style={{ marginBottom: spacing.md }}>
          Delivery address
        </AppText>

        {addresses.status === 'error' ? (
          <View style={{ marginBottom: spacing.md }}>
            <AppText variant="small" style={{ color: colors.muted }}>
              Saved addresses could not be loaded.
            </AppText>
            <Pressable onPress={addresses.reload} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: spacing.xs }}>
              <AppText variant="label" style={{ color: colors.clay }}>
                Try again
              </AppText>
            </Pressable>
          </View>
        ) : null}

        {savedList.length > 0 ? (
          <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            {savedList.map((a) => (
              <SavedAddress key={a._id} address={a} selected={useSaved && picked?._id === a._id} onPress={() => chooseSaved(a)} />
            ))}
            <Pressable onPress={() => setSelectedId('')} accessibilityRole="radio" accessibilityState={{ selected: !useSaved }} accessibilityLabel="Deliver to a new address">
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderColor: !useSaved ? colors.ink : colors.line, borderWidth: !useSaved ? 2 : 1 }}>
                <Feather name={!useSaved ? 'check-circle' : 'circle'} size={20} color={!useSaved ? colors.ink : colors.muted} />
                <AppText variant="strong">Deliver to a new address</AppText>
              </Card>
            </Pressable>
            <Pressable onPress={() => router.push('/addresses')} accessibilityRole="link" hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: spacing.xs }}>
              <AppText variant="label" style={{ color: colors.clay }}>
                Manage saved addresses
              </AppText>
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
              style={{ marginBottom: spacing.lg }}
            />

            <AppText variant="label">Delivery spot on the map</AppText>
            <AppText variant="small" style={{ marginTop: spacing.xs, marginBottom: spacing.sm }}>
              Tap where we should deliver. Shaded areas are where we deliver, and only stores in that area will deliver to you.
            </AppText>
            {!blocksReady ? (
              <Skeleton height={260} />
            ) : (
              <NearbyMap
                zones={blocks}
                selectedIds={containing.map((b) => b._id)}
                pin={pin}
                height={260}
                originLabel="Delivery spot"
                onPick={(lat, lng) => setPickedPin({ lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 })}
              />
            )}
            <View accessibilityLiveRegion="polite" style={{ marginTop: spacing.sm, minHeight: 20 }}>
              {!pin ? (
                <AppText variant="small">No spot chosen yet.</AppText>
              ) : !pinKey || pinRemote.status === 'loading' ? (
                <AppText variant="small">Checking the spot…</AppText>
              ) : pinRemote.status === 'error' ? (
                <AppText variant="small" style={{ color: colors.danger }}>
                  {pinRemote.error}
                </AppText>
              ) : pinOutside ? (
                <AppText variant="small" style={{ color: colors.danger }}>
                  We do not deliver there yet. Tap inside a shaded area.
                </AppText>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Feather name="check" size={14} color={colors.success} />
                  <AppText variant="small" style={{ color: colors.ink }}>
                    Delivering to {containing.map((b) => b.name).join(' + ')}
                  </AppText>
                </View>
              )}
            </View>

            <View style={{ marginTop: spacing.lg, marginBottom: spacing.lg }}>
              <Pressable
                onPress={() => setSaveIt((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: saveIt }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: minTouch }}
              >
                <Feather name={saveIt ? 'check-square' : 'square'} size={22} color={saveIt ? colors.ink : colors.muted} />
                <AppText variant="body">Save this address for next time</AppText>
              </Pressable>
              {saveIt ? (
                <TextField label="Name it" value={label} onChangeText={setLabel} maxLength={40} autoCapitalize="words" style={{ marginTop: spacing.sm }} />
              ) : null}
            </View>
          </>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.lg }}>
            <Feather name="map-pin" size={14} color={picked?.blocks?.length ? colors.success : colors.clay} />
            <AppText variant="small" style={{ color: picked?.blocks?.length ? colors.ink : colors.clay, flex: 1 }}>
              {picked?.blocks?.length ? `Delivering to ${picked.blocks.map((b) => b.name).join(' + ')}` : 'This address is no longer inside a delivery area. Choose another address.'}
            </AppText>
          </View>
        )}

        <View style={{ marginBottom: spacing.xl }}>
          <AppText variant="label" style={{ marginBottom: spacing.xs }}>
            Delivery notes
          </AppText>
          <View style={{ borderWidth: 1, borderColor: errors.additionalInstructions ? colors.danger : colors.line, borderRadius: radius.md, backgroundColor: colors.surface }}>
            <FieldNotes value={notes} onChange={setNotes} inputRef={notesRef} />
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
        <View style={{ marginBottom: spacing.xl }}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderColor: colors.ink }}>
            <Feather name="dollar-sign" size={20} color={colors.clay} />
            <View style={{ flex: 1 }}>
              <AppText variant="strong">Cash on delivery</AppText>
              <AppText variant="small">
                Pay the courier when your order arrives. They can also show the store&apos;s bank, wallet or card machine on request.
              </AppText>
            </View>
            <Feather name="check-circle" size={20} color={colors.success} />
          </Card>
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
          <Button title={`Place order · ${formatPrice(cart.subtotal)}`} onPress={onSubmit} loading={submitting} disabled={words > MAX_NOTE_WORDS} />
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
