import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import TextField from '../../components/ui/TextField'
import BackButton from '../../components/BackButton'
import RequireCustomer from '../../components/RequireCustomer'
import NearbyMap from '../../components/NearbyMap'
import { useAuth } from '../../hooks/useAuth'
import { useCity } from '../../hooks/useCity'
import { useNearby } from '../../hooks/useNearby'
import { useRemote } from '../../hooks/useRemote'
import { getErrorMessage, getFieldErrors } from '../../services/api'
import { addressBody, createAddress, fetchAddresses, makeDefaultAddress, updateAddress, validateAddress } from '../../services/addresses'
import { resolvePoint } from '../../services/nearby'
import { colors, radius, spacing } from '../../theme'

const emptyForm = (user, city) => ({
  label: 'Home',
  fullName: user?.name || '',
  phone: '',
  addressLine: '',
  city: city?.name || '',
  postalCode: '',
  additionalInstructions: '',
  isDefault: false,
})

function AddressForm({ id }) {
  const router = useRouter()
  const { user } = useAuth()
  const { city } = useCity()
  const { blocks, blocksReady, origin } = useNearby()
  const editing = id !== 'new'

  const saved = useRemote(`addresses:${user?.id}`, fetchAddresses)
  const record = editing ? (saved.data || []).find((a) => a._id === id) : null

  const [form, setForm] = useState(() => emptyForm(user, city))
  const [pin, setPin] = useState(null)
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState('')
  const [saving, setSaving] = useState(false)
  const loaded = useRef(false)

  // An existing address starts from what is saved, including its pin.
  useEffect(() => {
    if (!editing || loaded.current || !record) return
    loaded.current = true
    setForm({
      label: record.label || 'Home',
      fullName: record.fullName || '',
      phone: record.phone || '',
      addressLine: record.addressLine || '',
      city: record.city || '',
      postalCode: record.postalCode || '',
      additionalInstructions: record.additionalInstructions || '',
      isDefault: record.isDefault === true,
    })
    setPin({ lat: record.latitude, lng: record.longitude })
  }, [editing, record])

  // A new address starts at the shopper's area centre when there is one; the map moves it.
  useEffect(() => {
    if (editing || pin || !origin) return
    setPin({ lat: origin.lat, lng: origin.lng })
  }, [editing, pin, origin])

  const pinRemote = useRemote(`address-pin:${pin ? `${pin.lat},${pin.lng}` : 'none'}`, () =>
    pin ? resolvePoint(pin) : Promise.resolve({ containing: [], nearest: [] }),
  )
  const containing = pinRemote.status === 'ready' ? pinRemote.data?.containing || [] : []
  const outside = Boolean(pin) && pinRemote.status === 'ready' && containing.length === 0

  const set = (field) => (value) => {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  async function save() {
    if (saving) return
    setBanner('')
    const candidate = { ...form, latitude: pin?.lat, longitude: pin?.lng }
    const problems = validateAddress(candidate)
    if (pin && pinRemote.status === 'error') {
      setBanner(pinRemote.error || 'We could not check this spot. Try again.')
      return
    }
    if (pin && pinRemote.status === 'loading') {
      setBanner('Checking the delivery spot… try again in a moment.')
      return
    }
    if (outside) problems.pin = 'We do not deliver to this spot yet. Tap inside a shaded area.'
    setErrors(problems)
    if (Object.keys(problems).length > 0) {
      setBanner(problems.pin || 'Please check the highlighted fields.')
      return
    }

    setSaving(true)
    try {
      if (editing) {
        await updateAddress(id, addressBody(candidate))
        if (form.isDefault && !record?.isDefault) await makeDefaultAddress(id)
      } else {
        await createAddress(addressBody(candidate))
      }
      if (router.canGoBack()) router.back()
      else router.replace('/addresses')
    } catch (err) {
      setErrors((e) => ({ ...e, ...getFieldErrors(err) }))
      setBanner(getErrorMessage(err))
      setSaving(false)
    }
  }

  if (editing && saved.status === 'loading') {
    return (
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
        <Skeleton height={56} />
        <Skeleton height={56} />
        <Skeleton height={260} />
      </View>
    )
  }
  if (editing && saved.status === 'error') {
    return (
      <View style={{ padding: spacing.lg }}>
        <EmptyState icon="wifi-off" tone="error" title="Couldn't load this address" message={saved.error} action={<Button title="Try again" onPress={saved.reload} />} />
      </View>
    )
  }
  if (editing && !loaded.current) {
    return (
      <View style={{ padding: spacing.lg }}>
        <EmptyState icon="map-pin" title="Address not found" message="It may have been deleted on another device." action={<Button title="Back to addresses" onPress={() => router.replace('/addresses')} />} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        {banner ? (
          <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg }}>
            <AppText variant="small" style={{ color: colors.danger }}>
              {banner}
            </AppText>
          </View>
        ) : null}

        <TextField label="Name this address" value={form.label} onChangeText={set('label')} error={errors.label} autoCapitalize="words" style={{ marginBottom: spacing.lg }} />
        <TextField label="Full name" value={form.fullName} onChangeText={set('fullName')} error={errors.fullName} autoComplete="name" textContentType="name" autoCapitalize="words" style={{ marginBottom: spacing.lg }} />
        <TextField
          label="Phone"
          value={form.phone}
          onChangeText={set('phone')}
          error={errors.phone}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder="+92 300 1234567"
          style={{ marginBottom: spacing.lg }}
        />
        <TextField label="Street address" value={form.addressLine} onChangeText={set('addressLine')} error={errors.addressLine} autoComplete="street-address" textContentType="streetAddressLine1" style={{ marginBottom: spacing.lg }} />
        <TextField label="City" value={form.city} onChangeText={set('city')} error={errors.city} autoCapitalize="words" textContentType="addressCity" style={{ marginBottom: spacing.lg }} />
        <TextField
          label="Postal code (optional)"
          value={form.postalCode}
          onChangeText={set('postalCode')}
          error={errors.postalCode}
          keyboardType="number-pad"
          textContentType="postalCode"
          style={{ marginBottom: spacing.lg }}
        />
        <TextField
          label="Delivery notes (optional)"
          value={form.additionalInstructions}
          onChangeText={set('additionalInstructions')}
          error={errors.additionalInstructions}
          placeholder="Landmark, gate colour, when to call"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          style={{ marginBottom: spacing.xl }}
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
            onPick={(lat, lng) => setPin({ lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 })}
          />
        )}
        <View accessibilityLiveRegion="polite" style={{ marginTop: spacing.sm, minHeight: 20 }}>
          {!pin ? (
            <AppText variant="small">No spot chosen yet.</AppText>
          ) : pinRemote.status === 'loading' ? (
            <AppText variant="small">Checking the spot…</AppText>
          ) : pinRemote.status === 'error' ? (
            <AppText variant="small" style={{ color: colors.danger }}>
              {pinRemote.error}
            </AppText>
          ) : outside ? (
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
        {errors.pin ? (
          <AppText variant="small" style={{ color: colors.danger, marginTop: spacing.xs }}>
            {errors.pin}
          </AppText>
        ) : null}

        <View style={{ marginTop: spacing.xl, marginBottom: spacing.xl }}>
          {editing && record?.isDefault ? (
            <AppText variant="small">This is your default address.</AppText>
          ) : (
            <Pressable
              onPress={() => setForm((f) => ({ ...f, isDefault: !f.isDefault }))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: form.isDefault }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 }}
            >
              <Feather name={form.isDefault ? 'check-square' : 'square'} size={22} color={form.isDefault ? colors.ink : colors.muted} />
              <AppText variant="body">Make this my default address</AppText>
            </Pressable>
          )}
        </View>

        <Button title={editing ? 'Save changes' : 'Save address'} onPress={save} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

export default function AddressScreen() {
  const { id: rawId } = useLocalSearchParams()
  const id = Array.isArray(rawId) ? rawId[0] : rawId
  const next = id === 'new' ? '/addresses/new' : `/addresses/${id}`

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <BackButton />
        <AppText variant="heading" accessibilityRole="header">
          {id === 'new' ? 'New address' : 'Edit address'}
        </AppText>
      </View>
      <RequireCustomer next={next} icon="map-pin" title="Sign in to save an address" message="Saved addresses belong to your account.">
        <AddressForm key={id} id={id} />
      </RequireCustomer>
    </SafeAreaView>
  )
}
