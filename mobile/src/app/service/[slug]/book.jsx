import { useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../../../components/ui/AppText'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'
import EmptyState from '../../../components/ui/EmptyState'
import OptionSheet from '../../../components/ui/OptionSheet'
import Skeleton from '../../../components/ui/Skeleton'
import TextField from '../../../components/ui/TextField'
import BackButton from '../../../components/BackButton'
import NearbyMap from '../../../components/NearbyMap'
import ProductImage from '../../../components/ProductImage'
import RequireCustomer from '../../../components/RequireCustomer'
import { useAuth } from '../../../hooks/useAuth'
import { useNearby } from '../../../hooks/useNearby'
import { useRemote } from '../../../hooks/useRemote'
import { getErrorMessage, getFieldErrors } from '../../../services/api'
import { fetchAddresses } from '../../../services/addresses'
import { getShopperPosition } from '../../../services/location'
import { createServiceBooking, fetchServiceProvider } from '../../../services/services'
import { roundCoord } from '../../../utils/geo'
import { formatPrice } from '../../../utils/format'
import {
  availableSlots,
  customDateOptions,
  customTimeOptions,
  dateOptionsFromSlots,
  durationLabel,
  karachiDateTimeToIso,
  toPaisa,
} from '../../../utils/serviceSlots'
import { colors, fonts, minTouch, radius, spacing } from '../../../theme'

const PHONE_PATTERN = /^[0-9+()\-\s]{7,20}$/
const NOTE_MAX = 1000

function SelectRow({ label, value, placeholder, error, hint, onPress }) {
  return (
    <View style={{ flex: 1, minWidth: 140 }}>
      <AppText variant="label" style={{ marginBottom: spacing.xs }}>
        {label}
      </AppText>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}`}
        style={{
          minHeight: minTouch,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          borderWidth: 1,
          borderColor: error ? colors.danger : colors.line,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          paddingHorizontal: spacing.md,
        }}
      >
        <AppText variant={value ? 'label' : 'small'} numberOfLines={1} style={{ flex: 1, color: value ? colors.ink : colors.muted }}>
          {value || placeholder}
        </AppText>
        <Feather name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      {error ? (
        <AppText variant="small" accessibilityLiveRegion="polite" style={{ color: colors.danger, marginTop: spacing.xs }}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="small" style={{ marginTop: spacing.xs, fontSize: 12 }}>
          {hint}
        </AppText>
      ) : null}
    </View>
  )
}

function SavedAddress({ address, selected, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${address.label}, ${address.fullName}`}>
      <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, borderColor: selected ? colors.ink : colors.line, borderWidth: selected ? 2 : 1 }}>
        <Feather name={selected ? 'check-circle' : 'circle'} size={20} color={selected ? colors.ink : colors.muted} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <AppText variant="strong">
            {address.label} · {address.fullName}
          </AppText>
          <AppText variant="small" numberOfLines={2}>
            {address.addressLine}
            {address.city ? `, ${address.city}` : ''}
          </AppText>
        </View>
      </Card>
    </Pressable>
  )
}

function NoteField({ value, onChange, error }) {
  return (
    <View>
      <AppText variant="label" style={{ marginBottom: spacing.xs }}>
        Note for the provider
      </AppText>
      <View style={{ borderWidth: 1, borderColor: error ? colors.danger : colors.line, borderRadius: radius.md, backgroundColor: colors.surface }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          multiline
          maxLength={NOTE_MAX}
          textAlignVertical="top"
          accessibilityLabel="Note for the provider"
          placeholder="Anything they should know before quoting?"
          placeholderTextColor={colors.muted}
          style={{ minHeight: minTouch * 1.8, padding: spacing.md, fontFamily: fonts.regular, fontSize: 15, color: colors.ink }}
        />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.xs }}>
        <AppText variant="small" style={{ flex: 1, color: error ? colors.danger : colors.muted }}>
          {error || 'Optional.'}
        </AppText>
        <AppText variant="small">{value.length}/{NOTE_MAX}</AppText>
      </View>
    </View>
  )
}

function BookingForm({ provider, slug }) {
  const router = useRouter()
  const { user } = useAuth()
  const { origin } = useNearby()

  const offerings = provider.offerings || []
  const [offeringId, setOfferingId] = useState(offerings[0]?._id || '')
  const [offeringOpen, setOfferingOpen] = useState(false)
  const offering = offerings.find((item) => item._id === offeringId) || offerings[0]

  const [offer, setOffer] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(null)
  const placing = useRef(false)

  // Published hours: pick one of the provider's own slots (Pakistan time).
  const published = Boolean(provider.availability?.isPublished)
  const slots = useMemo(
    () => (published ? availableSlots(provider.availability, offering?.durationMinutes, { days: 10 }) : []),
    [published, provider.availability, offering],
  )
  const dates = useMemo(() => dateOptionsFromSlots(slots), [slots])
  const [dateKey, setDateKey] = useState('')
  const [slot, setSlot] = useState('')
  const chosenDate = dates.some((item) => item.value === dateKey) ? dateKey : dates[0]?.value || ''
  const daySlots = slots.filter((item) => item.dateKey === chosenDate)
  const chosenSlot = slot || daySlots[0]?.value || ''
  const chosenSlotLabel = daySlots.find((item) => item.value === chosenSlot)?.timeLabel || ''
  const [dateOpen, setDateOpen] = useState(false)
  const [timeOpen, setTimeOpen] = useState(false)

  // No published hours: ask for any future time over the next two weeks.
  const customDates = useMemo(() => customDateOptions(), [])
  const [customDate, setCustomDate] = useState(customDates[0]?.value || '')
  const [customMinute, setCustomMinute] = useState(null)
  const customTimes = useMemo(() => customTimeOptions({ dateKey: customDate }), [customDate])
  const chosenMinute = customMinute ?? customTimes[0]?.value ?? null
  const chosenDateLabel = customDates.find((item) => item.value === customDate)?.label || ''
  const chosenTimeLabel = customTimes.find((item) => item.value === chosenMinute)?.label || ''
  const [customDateOpen, setCustomDateOpen] = useState(false)
  const [customTimeOpen, setCustomTimeOpen] = useState(false)

  // Saved addresses only count when they fall inside the provider's block.
  const addresses = useRemote(`booking-addresses:${user?.id || ''}`, fetchAddresses)
  const eligible = (addresses.data || []).filter((address) =>
    address.blocks?.some((block) => block._id === provider.block?._id),
  )
  const [mode, setMode] = useState(null) // null follows the addresses: saved when one fits, else manual
  const addressMode = mode || (eligible.length > 0 ? 'saved' : 'manual')
  const [addressId, setAddressId] = useState('')
  const selectedAddress = eligible.find((address) => address._id === addressId) || eligible[0] || null

  const [manual, setManual] = useState({ fullName: user?.name || '', phone: '', addressLine: '' })
  const [pickedPin, setPickedPin] = useState(null)
  const defaultPin = origin ? { lat: roundCoord(origin.lat), lng: roundCoord(origin.lng) } : provider.block?.center || null
  const pin = pickedPin || defaultPin
  const [locating, setLocating] = useState(false)
  const [pinNote, setPinNote] = useState('')

  const setManualField = (field) => (value) => {
    setManual((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const offeringLabel = offering
    ? `${offering.title} — ${formatPrice((offering.startingAtPrice || 0) / 100)}`
    : 'Choose a service'

  async function useMyLocation() {
    setLocating(true)
    setPinNote('')
    try {
      const position = await getShopperPosition()
      setPickedPin({ lat: roundCoord(position.lat), lng: roundCoord(position.lng) })
      setErrors((current) => ({ ...current, location: undefined }))
    } catch (err) {
      setPinNote(err.message)
    } finally {
      setLocating(false)
    }
  }

  async function submit() {
    if (placing.current) return
    if (!offering) {
      setBanner('This provider has no services to book right now.')
      return
    }
    setBanner('')
    const next = {}

    let scheduledStart = null
    if (published) {
      scheduledStart = chosenSlot || null
    } else {
      scheduledStart = chosenMinute === null ? null : karachiDateTimeToIso(customDate, chosenMinute)
    }
    if (!scheduledStart) next.scheduledStart = 'Choose a date and time.'

    let offerPaisa = null
    if (offer.trim()) {
      offerPaisa = toPaisa(offer)
      if (offerPaisa === null || offerPaisa < 1) next.customerOfferPaisa = 'Enter the amount you want to pay.'
    }

    let address
    let location
    if (addressMode === 'saved' && selectedAddress) {
      address = {
        fullName: selectedAddress.fullName,
        phone: selectedAddress.phone,
        addressLine: selectedAddress.addressLine,
        ...(selectedAddress.city && { city: selectedAddress.city }),
      }
      location = { lat: selectedAddress.latitude, lng: selectedAddress.longitude }
    } else {
      if (manual.fullName.trim().length < 2) next.fullName = 'Enter the name of the person to meet.'
      if (!PHONE_PATTERN.test(manual.phone.trim())) next.phone = 'Enter a phone number the provider can call.'
      if (manual.addressLine.trim().length < 5) next.addressLine = 'Enter the full address.'
      if (!pin) next.location = 'Mark where the job happens on the map.'
      address = { fullName: manual.fullName.trim(), phone: manual.phone.trim(), addressLine: manual.addressLine.trim() }
      location = pin
    }

    if (note.trim().length > NOTE_MAX) next.note = 'That note is too long.'

    setErrors(next)
    if (Object.keys(next).length > 0) {
      setBanner('Check the highlighted fields.')
      return
    }

    placing.current = true
    setSubmitting(true)
    try {
      const booking = await createServiceBooking({
        providerId: provider._id,
        offeringId: offering._id,
        scheduledStart,
        address,
        location,
        ...(note.trim() && { note: note.trim() }),
        ...(offerPaisa !== null && { customerOfferPaisa: offerPaisa }),
      })
      setDone(booking)
    } catch (err) {
      const mapped = {}
      for (const [field, message] of Object.entries(getFieldErrors(err))) {
        mapped[field.startsWith('address.') ? field.split('.')[1] : field] = message
      }
      setErrors(mapped)
      setBanner(getErrorMessage(err, "Couldn't send this request."))
      placing.current = false
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <Card style={{ alignItems: 'center', gap: spacing.sm, backgroundColor: colors.successSoft, borderColor: colors.success }}>
          <Feather name="check-circle" size={32} color={colors.success} />
          <AppText variant="heading" style={{ textAlign: 'center' }}>
            Request sent
          </AppText>
          <AppText variant="label">Booking {done.bookingNumber}</AppText>
          <AppText variant="small" style={{ textAlign: 'center', lineHeight: 19 }}>
            {provider.displayName} will accept, or send a price. You can chat once it is accepted.
          </AppText>
        </Card>
        <Button title={`Back to ${provider.displayName}`} onPress={() => router.replace(`/service/${slug}`)} />
        <Button title="View my bookings" variant="outline" onPress={() => router.replace('/bookings')} />
        <Button title="Browse more services" variant="outline" onPress={() => router.navigate('/services')} />
      </ScrollView>
    )
  }

  if (offerings.length === 0) {
    return (
      <View style={{ padding: spacing.lg }}>
        <EmptyState
          icon="tool"
          title="No services to book yet"
          message={`${provider.displayName} has not listed a service yet. Check back later, or message them about the job.`}
          action={<Button title={`Back to ${provider.displayName}`} onPress={() => router.replace(`/service/${slug}`)} />}
        />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <ProductImage src={provider.avatar} name={provider.displayName} width={52} style={{ width: 52, height: 52, borderRadius: radius.md }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="strong" numberOfLines={1}>
              {provider.displayName}
            </AppText>
            <AppText variant="small" numberOfLines={1}>
              {[provider.category?.name, provider.block?.name].filter(Boolean).join(' · ')}
            </AppText>
          </View>
        </Card>

        {banner ? (
          <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md }}>
            <AppText variant="small" style={{ color: colors.danger }}>
              {banner}
            </AppText>
          </View>
        ) : null}

        <View>
          <AppText variant="label" style={{ marginBottom: spacing.xs }}>
            Service
          </AppText>
          <Pressable
            onPress={() => setOfferingOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Service: ${offeringLabel}`}
            style={{
              minHeight: minTouch,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.md,
              backgroundColor: colors.surface,
              paddingHorizontal: spacing.md,
            }}
          >
            <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>
              {offeringLabel}
            </AppText>
            <Feather name="chevron-down" size={18} color={colors.muted} />
          </Pressable>
          {offering ? (
            <AppText variant="small" style={{ marginTop: spacing.xs, fontSize: 12 }}>
              Full service · about {durationLabel(offering.durationMinutes)} on site
            </AppText>
          ) : null}
        </View>

        {offering ? (
          <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cream, padding: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md }}>
              <AppText variant="small" style={{ color: colors.muted }}>
                Full service, one visit
              </AppText>
              <AppText variant="heading" style={{ fontSize: 20, lineHeight: 26 }}>
                {formatPrice((offering.startingAtPrice || 0) / 100)}
              </AppText>
            </View>
            <AppText variant="small" style={{ marginTop: spacing.xs, fontSize: 11.5, lineHeight: 17 }}>
              Not an hourly rate. The provider quotes the whole job, and you agree the final price before work starts.
            </AppText>
          </View>
        ) : null}

        <View>
          <TextField
            label="Your price for the job (Rs) — optional"
            value={offer}
            onChangeText={(value) => {
              setOffer(value)
              setErrors((current) => ({ ...current, customerOfferPaisa: undefined }))
            }}
            error={errors.customerOfferPaisa}
            keyboardType="number-pad"
            placeholder="Leave blank to let them quote"
          />
          <AppText variant="small" style={{ marginTop: spacing.xs, fontSize: 12, lineHeight: 18 }}>
            Want to bargain? Propose the whole-job amount. The provider can accept it, decline, or send a counter-offer.
            Leave blank to let them quote.
          </AppText>
        </View>

        {published ? (
          slots.length > 0 ? (
            <View>
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <SelectRow
                  label="Date"
                  value={chosenDateLabel || 'Choose a date'}
                  placeholder="Choose a date"
                  onPress={() => setDateOpen(true)}
                />
                <SelectRow
                  label="Time"
                  value={chosenSlotLabel}
                  placeholder="Choose a time"
                  error={errors.scheduledStart}
                  hint="Pakistan time."
                  onPress={() => setTimeOpen(true)}
                />
              </View>
            </View>
          ) : (
            <View>
              <AppText variant="label">Date and time</AppText>
              <View style={{ borderRadius: radius.md, backgroundColor: colors.sand, padding: spacing.md, marginTop: spacing.xs }}>
                <AppText variant="small" style={{ lineHeight: 19 }}>
                  No open times in the next ten days. Try another service, or check back after the provider updates
                  their hours.
                </AppText>
              </View>
            </View>
          )
        ) : (
          <View>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <SelectRow
                label="Date"
                value={chosenDateLabel}
                placeholder="Choose a date"
                onPress={() => setCustomDateOpen(true)}
              />
              <SelectRow
                label="Time"
                value={chosenTimeLabel}
                placeholder="Choose a time"
                error={errors.scheduledStart}
                onPress={() => setCustomTimeOpen(true)}
              />
            </View>
            <AppText variant="small" style={{ marginTop: spacing.xs, fontSize: 12, lineHeight: 18 }}>
              Pakistan time. This provider has no fixed hours, so ask for any future time and they confirm the slot.
            </AppText>
          </View>
        )}

        <View>
          <AppText variant="label" style={{ marginBottom: spacing.xs }}>
            Where is the job?
          </AppText>
          {addresses.status === 'loading' ? (
            <Skeleton height={70} />
          ) : (
            <>
              {eligible.length > 0 ? (
                <View style={{ gap: spacing.sm }}>
                  {eligible.map((address) => (
                    <SavedAddress
                      key={address._id}
                      address={address}
                      selected={addressMode === 'saved' && selectedAddress?._id === address._id}
                      onPress={() => {
                        setMode('saved')
                        setAddressId(address._id)
                      }}
                    />
                  ))}
                  <Pressable onPress={() => setMode('manual')} accessibilityRole="radio" accessibilityState={{ selected: addressMode === 'manual' }} accessibilityLabel="Use a different address">
                    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderColor: addressMode === 'manual' ? colors.ink : colors.line, borderWidth: addressMode === 'manual' ? 2 : 1 }}>
                      <Feather name={addressMode === 'manual' ? 'check-circle' : 'circle'} size={20} color={addressMode === 'manual' ? colors.ink : colors.muted} />
                      <AppText variant="strong">Use a different address</AppText>
                    </Card>
                  </Pressable>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.sand, padding: spacing.md }}>
                  <Feather name="map-pin" size={14} color={colors.clay} style={{ marginTop: 2 }} />
                  <AppText variant="small" style={{ flex: 1, lineHeight: 19 }}>
                    This provider works only in {provider.block?.name || 'one block'}. Enter an address inside that
                    block.
                  </AppText>
                </View>
              )}
              {addresses.status === 'error' ? (
                <AppText variant="small" style={{ color: colors.muted, marginTop: spacing.sm }}>
                  Saved addresses could not be loaded. Enter the address below.
                </AppText>
              ) : null}
            </>
          )}
        </View>

        {addressMode === 'manual' ? (
          <View style={{ gap: spacing.md }}>
            <TextField label="Person to meet" value={manual.fullName} onChangeText={setManualField('fullName')} error={errors.fullName} autoCapitalize="words" />
            <TextField
              label="Phone"
              value={manual.phone}
              onChangeText={setManualField('phone')}
              error={errors.phone}
              keyboardType="phone-pad"
              placeholder="+92 300 1234567"
            />
            <TextField label="Address" value={manual.addressLine} onChangeText={setManualField('addressLine')} error={errors.addressLine} />
            <View>
              <AppText variant="label">Pin</AppText>
              {pin ? (
                <NearbyMap
                  pin={pin}
                  zones={[]}
                  height={220}
                  originLabel="Job location"
                  onPick={(lat, lng) => {
                    setPickedPin({ lat: roundCoord(lat), lng: roundCoord(lng) })
                    setErrors((current) => ({ ...current, location: undefined }))
                  }}
                />
              ) : (
                <Skeleton height={220} />
              )}
              <View accessibilityLiveRegion="polite" style={{ marginTop: spacing.xs, minHeight: 20 }}>
                {errors.location || pinNote ? (
                  <AppText variant="small" style={{ color: colors.danger }}>
                    {errors.location || pinNote}
                  </AppText>
                ) : (
                  <AppText variant="small" style={{ lineHeight: 18 }}>
                    Tap the map to mark the exact spot inside {provider.block?.name || 'the service block'}. The
                    provider sees it only after they accept.
                  </AppText>
                )}
              </View>
              <Pressable
                onPress={useMyLocation}
                disabled={locating}
                accessibilityRole="button"
                accessibilityLabel="Use my current location"
                hitSlop={8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', minHeight: 40, opacity: locating ? 0.6 : 1 }}
              >
                <Feather name="crosshair" size={15} color={colors.clay} />
                <AppText variant="label" style={{ color: colors.clay }}>
                  {locating ? 'Finding location…' : 'Use my current location'}
                </AppText>
              </Pressable>
            </View>
          </View>
        ) : null}

        <NoteField
          value={note}
          onChange={(value) => {
            setNote(value)
            setErrors((current) => ({ ...current, note: undefined }))
          }}
          error={errors.note}
        />

        <Button
          title={submitting ? 'Sending…' : 'Request this time'}
          onPress={submit}
          loading={submitting}
          disabled={published && slots.length === 0}
        />
        <AppText variant="small" style={{ textAlign: 'center', fontSize: 11 }}>
          No payment is taken here. Pay the provider at the door.
        </AppText>
      </ScrollView>

      <OptionSheet
        visible={offeringOpen}
        title="Choose a service"
        options={offerings.map((item) => ({ value: item._id, label: `${item.title} — ${formatPrice((item.startingAtPrice || 0) / 100)}` }))}
        selected={offering?._id || ''}
        onSelect={(value) => {
          setOfferingId(value)
          setSlot('')
          setOfferingOpen(false)
        }}
        onClose={() => setOfferingOpen(false)}
      />
      <OptionSheet
        visible={dateOpen}
        title="Choose a date"
        options={dates}
        selected={chosenDate}
        onSelect={(value) => {
          setDateKey(value)
          setSlot('')
          setDateOpen(false)
        }}
        onClose={() => setDateOpen(false)}
      />
      <OptionSheet
        visible={timeOpen}
        title="Choose a time"
        options={daySlots.map((item) => ({ value: item.value, label: item.timeLabel }))}
        selected={chosenSlot}
        onSelect={(value) => {
          setSlot(value)
          setTimeOpen(false)
        }}
        onClose={() => setTimeOpen(false)}
      />
      <OptionSheet
        visible={customDateOpen}
        title="Choose a date"
        options={customDates}
        selected={customDate}
        onSelect={(value) => {
          setCustomDate(value)
          setCustomMinute(null)
          setCustomDateOpen(false)
        }}
        onClose={() => setCustomDateOpen(false)}
      />
      <OptionSheet
        visible={customTimeOpen}
        title="Choose a time"
        options={customTimes}
        selected={chosenMinute}
        onSelect={(value) => {
          setCustomMinute(value)
          setCustomTimeOpen(false)
        }}
        onClose={() => setCustomTimeOpen(false)}
      />
    </KeyboardAvoidingView>
  )
}

export default function BookServiceScreen() {
  const router = useRouter()
  const { slug: rawSlug } = useLocalSearchParams()
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug
  const provider = useRemote(`service-provider:${slug || ''}`, () =>
    slug
      ? fetchServiceProvider(slug)
      : Promise.reject(Object.assign(new Error('bad slug'), { response: { status: 400, data: {} } })),
  )
  const gone = provider.httpStatus === 404 || provider.httpStatus === 400 || (provider.status === 'ready' && !provider.data)

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <BackButton />
        <AppText variant="heading" accessibilityRole="header">
          Request a booking
        </AppText>
      </View>

      <RequireCustomer next={`/service/${slug || ''}/book`} icon="calendar" title="Sign in to request a booking" message="We need your account to send the request and keep track of it for you.">
        {provider.status === 'loading' ? (
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <Skeleton height={70} />
            <Skeleton height={70} />
            <Skeleton height={120} />
          </View>
        ) : provider.status === 'error' || !provider.data ? (
          <View style={{ padding: spacing.lg }}>
            <EmptyState
              icon={gone ? 'tool' : 'wifi-off'}
              tone={gone ? 'default' : 'error'}
              title={gone ? 'Provider not found' : "Couldn't load this provider"}
              message={gone ? 'This provider page is not available. The link may be wrong, or they closed.' : provider.error}
              action={
                gone ? (
                  <Button title="Browse services" onPress={() => router.navigate('/services')} />
                ) : (
                  <Button title="Try again" onPress={provider.reload} />
                )
              }
            />
          </View>
        ) : (
          <BookingForm key={provider.data._id} provider={provider.data} slug={slug} />
        )}
      </RequireCustomer>
    </SafeAreaView>
  )
}
