import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, LocateFixed, MapPin } from 'lucide-react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { Field, Skeleton, btn, fieldLabel } from '../../design'
import { formatPrice } from '../../ui'
import { getDevicePosition, parseLatLng } from '../../utils/geo'
import { availableSlots, karachiInputToIso, minuteLabel } from '../../utils/serviceSlots'
import { durationLabel, toPaisa } from '../../utils/serviceBookings'

function SignedOut() {
  return (
    <div className="mt-3">
      <p className="text-[12.5px] leading-relaxed text-ink/60">
        Sign in with a customer account to request a time. The provider replies with a price.
      </p>
      <Link to="/login" className={`mt-3 ${btn('noir', 'sm')}`}>
        Sign in to book
      </Link>
    </div>
  )
}

/**
 * Booking request form on a provider's public page (docs/24 §4.4). It only
 * collects the service, a time and where the job happens; the server derives
 * the provider, block and price floor, so none of those can be tampered with.
 */
export default function BookingRequest({ provider }) {
  const { user } = useAuth()
  const offerings = provider.offerings || []
  const [offeringId, setOfferingId] = useState(offerings[0]?._id || '')
  const offering = offerings.find((o) => o._id === offeringId) || offerings[0]

  const [addresses, setAddresses] = useState({ loaded: user?.role !== 'CUSTOMER', list: [], error: '' })
  const [mode, setMode] = useState('saved')
  const [addressId, setAddressId] = useState('')
  const [manual, setManual] = useState({ fullName: '', phone: '', addressLine: '', coordinates: '' })
  const [locating, setLocating] = useState(false)
  const [pinNote, setPinNote] = useState('')
  const [slot, setSlot] = useState('')
  const [dateKey, setDateKey] = useState('')
  const [customStart, setCustomStart] = useState('')
  const [note, setNote] = useState('')
  const [offer, setOffer] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)

  useEffect(() => {
    if (user?.role !== 'CUSTOMER') return undefined
    let active = true
    api
      .get('/addresses')
      .then((res) => active && setAddresses({ loaded: true, list: res.data.addresses, error: '' }))
      .catch((err) => active && setAddresses({ loaded: true, list: [], error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [user])

  const blockId = provider.block?._id
  const eligible = useMemo(
    () => addresses.list.filter((a) => a.blocks?.some((b) => b._id === blockId)),
    [addresses.list, blockId],
  )

  useEffect(() => {
    if (eligible.length === 0) {
      setMode('manual')
      setAddressId('')
    } else if (!eligible.some((a) => a._id === addressId)) {
      setMode('saved')
      setAddressId(eligible[0]._id)
    }
  }, [eligible, addressId])

  const slots = useMemo(
    () => (provider.availability?.isPublished ? availableSlots(provider.availability, offering?.durationMinutes) : []),
    [provider.availability, offering],
  )

  // {dateKey} -> {dayLabel} preserves the availability order (soonest first).
  const dates = useMemo(() => {
    const seen = new Map()
    for (const item of slots) {
      if (!seen.has(item.dateKey)) seen.set(item.dateKey, item.label.split(' · ')[0])
    }
    return [...seen].map(([value, label]) => ({ value, label }))
  }, [slots])

  const daySlots = useMemo(() => slots.filter((item) => item.dateKey === dateKey), [slots, dateKey])

  useEffect(() => {
    const nextDate = dates[0]?.value || ''
    setDateKey(nextDate)
    setSlot(slots.find((item) => item.dateKey === nextDate)?.value || '')
  }, [dates, slots])

  useEffect(() => {
    if (!dateKey) return
    if (!slots.some((item) => item.value === slot && item.dateKey === dateKey)) {
      setSlot(slots.find((item) => item.dateKey === dateKey)?.value || '')
    }
  }, [dateKey, slot, slots])

  if (user?.role !== 'CUSTOMER') {
    return (
      <div className="mt-3 text-[12.5px] text-ink/60">
        {user ? 'Only customer accounts can book a service.' : <SignedOut />}
      </div>
    )
  }

  if (done) {
    return (
      <div className="mt-3 rounded-panel border border-sage bg-sage/40 p-4">
        <p className="font-display text-[16px] font-semibold text-forest">Request sent — booking {done.bookingNumber}.</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-forest/80">
          The provider will accept, or send a price. You can chat once it is accepted.
        </p>
        <Link
          to={`/bookings/${done._id}`}
          className="mt-3 inline-block text-[12.5px] font-semibold text-forest underline underline-offset-4"
        >
          Open this booking
        </Link>
      </div>
    )
  }

  if (offerings.length === 0) {
    return <p className="mt-3 text-[12.5px] text-ink/60">This provider has not published a service list yet.</p>
  }

  const selectedAddress = eligible.find((a) => a._id === addressId)

  function chooseOffering(id) {
    setOfferingId(id)
    setMessage('')
  }

  async function useMyLocation() {
    setLocating(true)
    setPinNote('')
    try {
      const { lat, lng } = await getDevicePosition({ maximumAge: 0 })
      setManual((m) => ({ ...m, coordinates: `${lat}, ${lng}` }))
    } catch (err) {
      setPinNote(err.message)
    } finally {
      setLocating(false)
    }
  }

  async function onSubmit(event) {
    event.preventDefault()
    setFieldErrors({})
    setMessage('')

    const errors = {}
    const startIso = provider.availability?.isPublished ? slot : karachiInputToIso(customStart)
    if (!startIso) errors.scheduledStart = 'Choose a date and time.'

    let offerPaisa = null
    if (offer.trim()) {
      offerPaisa = toPaisa(offer)
      if (offerPaisa === null || offerPaisa < 1) errors.customerOfferPaisa = 'Enter the amount you want to pay.'
    }

    let address
    let location
    if (mode === 'saved' && selectedAddress) {
      address = {
        fullName: selectedAddress.fullName,
        phone: selectedAddress.phone,
        addressLine: selectedAddress.addressLine,
        ...(selectedAddress.city && { city: selectedAddress.city }),
      }
      location = { lat: selectedAddress.latitude, lng: selectedAddress.longitude }
    } else {
      if (manual.fullName.trim().length < 2) errors.fullName = 'Enter the name of the person to meet.'
      if (!/^[0-9+()\-\s]{7,20}$/.test(manual.phone.trim())) errors.phone = 'Enter a phone number the provider can call.'
      if (manual.addressLine.trim().length < 5) errors.addressLine = 'Enter the full address.'
      const parsed = parseLatLng(manual.coordinates)
      if (!parsed) errors.coordinates = 'Enter the pin as latitude, longitude.'
      address = { fullName: manual.fullName.trim(), phone: manual.phone.trim(), addressLine: manual.addressLine.trim() }
      location = parsed
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setMessage('Check the highlighted fields.')
      return
    }

    setSaving(true)
    try {
      const res = await api.post('/services/bookings', {
        providerId: provider._id,
        offeringId: offering._id,
        scheduledStart: startIso,
        address,
        location,
        ...(note.trim() && { note: note.trim() }),
        ...(offerPaisa !== null && { customerOfferPaisa: offerPaisa }),
      })
      setDone(res.data.booking)
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setMessage(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
      <Field
        as="select"
        label="Service"
        id="service-offering"
        value={offering?._id || ''}
        onChange={(e) => chooseOffering(e.target.value)}
        hint={offering ? `Full service · about ${durationLabel(offering.durationMinutes)} on site` : undefined}
      >
        {offerings.map((item) => (
          <option key={item._id} value={item._id}>
            {item.title} — {formatPrice(item.startingAtPrice / 100)}
          </option>
        ))}
      </Field>

      {offering && (
        <div className="rounded-tile border border-line-warm bg-canvas/70 px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] font-medium text-ink/60">Full service, one visit</span>
            <span className="font-display text-[18px] font-semibold text-ink">
              {formatPrice(offering.startingAtPrice / 100)}
            </span>
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink/50">
            Not an hourly rate. The provider quotes the whole job, and you agree the final price before work starts.
          </p>
        </div>
      )}

      <Field
        label="Your price for the job (Rs) — optional"
        id="booking-offer"
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        value={offer}
        onChange={(e) => setOffer(e.target.value)}
        error={fieldErrors.customerOfferPaisa}
        hint="Want to bargain? Propose the whole-job amount. The provider can accept it, decline, or send a counter-offer. Leave blank to let them quote."
      />

      {provider.availability?.isPublished ? (
        slots.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            <Field
              as="select"
              label="Date"
              id="service-date"
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
            >
              {dates.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Field>
            <Field
              as="select"
              label="Time"
              id="service-time"
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              hint="Pakistan time."
              error={fieldErrors.scheduledStart}
              required
            >
              {daySlots.map((item) => (
                <option key={item.value} value={item.value}>
                  {minuteLabel(item.startMinute)}
                </option>
              ))}
            </Field>
          </div>
        ) : (
          <div>
            <p className={fieldLabel}>Date and time</p>
            <p className="rounded-tile bg-canvas px-3.5 py-2.5 text-[12.5px] text-ink/55">
              No open times in the next ten days. Try another service, or check back after the provider updates their
              hours.
            </p>
          </div>
        )
      ) : (
        <Field
          label="Date and time"
          id="service-slot"
          type="datetime-local"
          value={customStart}
          onChange={(e) => setCustomStart(e.target.value)}
          hint="Pakistan time. This provider has no fixed hours, so ask for any future time and they confirm the slot."
          error={fieldErrors.scheduledStart}
          required
        />
      )}

      <div>
        <p className={fieldLabel}>Where is the job?</p>
        {!addresses.loaded ? (
          <Skeleton className="h-16 w-full rounded-tile" />
        ) : (
          <>
            {eligible.length > 0 && (
              <div className="space-y-2">
                {eligible.map((item) => (
                  <label
                    key={item._id}
                    className={`flex cursor-pointer gap-2.5 rounded-tile border p-3 text-[12.5px] transition ${
                      mode === 'saved' && addressId === item._id
                        ? 'border-clay/50 bg-cream/60'
                        : 'border-line-warm bg-canvas/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="booking-address"
                      checked={mode === 'saved' && addressId === item._id}
                      onChange={() => {
                        setMode('saved')
                        setAddressId(item._id)
                      }}
                      className="mt-0.5 h-4 w-4 accent-clay"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">
                        {item.label} · {item.fullName}
                      </span>
                      <span className="block truncate text-ink/55">
                        {item.addressLine}, {item.city}
                      </span>
                    </span>
                  </label>
                ))}
                <label className="flex cursor-pointer items-center gap-2.5 rounded-tile border border-line-warm bg-canvas/40 p-3 text-[12.5px]">
                  <input
                    type="radio"
                    name="booking-address"
                    checked={mode === 'manual'}
                    onChange={() => setMode('manual')}
                    className="h-4 w-4 accent-clay"
                  />
                  Use a different address
                </label>
              </div>
            )}
            {eligible.length === 0 && (
              <p className="flex items-start gap-1.5 rounded-tile bg-canvas px-3 py-2 text-[12px] text-ink/55">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-clay" aria-hidden="true" />
                This provider works only in {provider.block?.name || 'one block'}. Enter an address inside that block.
              </p>
            )}
          </>
        )}
      </div>

      {mode === 'manual' && (
        <div className="space-y-3">
          <Field
            label="Person to meet"
            id="booking-fullName"
            name="fullName"
            value={manual.fullName}
            onChange={(e) => setManual((m) => ({ ...m, fullName: e.target.value }))}
            error={fieldErrors.fullName}
            required
          />
          <Field
            label="Phone"
            id="booking-phone"
            name="phone"
            type="tel"
            value={manual.phone}
            onChange={(e) => setManual((m) => ({ ...m, phone: e.target.value }))}
            error={fieldErrors.phone}
            required
          />
          <Field
            label="Address"
            id="booking-addressLine"
            name="addressLine"
            value={manual.addressLine}
            onChange={(e) => setManual((m) => ({ ...m, addressLine: e.target.value }))}
            error={fieldErrors.addressLine}
            required
          />
          <div>
            <Field
              label="Pin"
              id="booking-coordinates"
              name="booking-coordinates"
              inputMode="decimal"
              autoComplete="off"
              placeholder="31.4186, 73.0790"
              value={manual.coordinates}
              onChange={(e) => setManual((m) => ({ ...m, coordinates: e.target.value }))}
              error={fieldErrors.coordinates || pinNote}
              hint="The exact spot is shared with the provider only after they accept."
              required
            />
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-clay transition hover:text-clay-dark disabled:opacity-50"
            >
              <LocateFixed className={`h-3.5 w-3.5 ${locating ? 'animate-spin' : ''}`} aria-hidden="true" />
              {locating ? 'Finding location…' : 'Use my current location'}
            </button>
          </div>
        </div>
      )}

      <Field
        as="textarea"
        label="Note for the provider"
        id="booking-note"
        rows={2}
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything they should know before quoting?"
        hint="Optional."
      />

      {message && (
        <p role="alert" className="rounded-tile border border-clay/25 bg-clay/5 px-3 py-2 text-[12.5px] text-clay">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={saving || (provider.availability?.isPublished && slots.length === 0)}
        className={`${btn('noir', 'md')} w-full`}
      >
        <CalendarClock className="h-4 w-4" aria-hidden="true" />
        {saving ? 'Sending…' : 'Request this time'}
      </button>
      <p className="text-center text-[11px] text-ink/45">No payment is taken here. Pay the provider at the door.</p>
    </form>
  )
}
