import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, MapPin } from 'lucide-react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import Field from '../Field'
import CoordinatesField from '../CoordinatesField'
import { Skeleton } from '../ui'
import { formatPrice, inputClass } from '../../ui'
import { parseLatLng } from '../../utils/geo'
import {
  availableSlots,
  karachiInputToIso,
} from '../../utils/serviceSlots'

const labelClass = 'mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted'

function durationLabel(minutes) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

function SignedOut() {
  return (
    <div className="mt-3">
      <p className="text-[13px] leading-relaxed text-muted">
        Sign in with a customer account to request a time. The provider replies with a price.
      </p>
      <Link to="/login" className="mt-3 inline-flex h-10 items-center rounded-md bg-ink px-4 text-[13px] font-medium text-white transition hover:bg-ink-soft">
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
  const [slot, setSlot] = useState('')
  const [customStart, setCustomStart] = useState('')
  const [note, setNote] = useState('')
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

  useEffect(() => {
    setSlot(slots[0]?.value || '')
  }, [slots])

  if (user?.role !== 'CUSTOMER') {
    return <div className="mt-3 text-[13px] text-muted">
      {user ? 'Only customer accounts can book a service.' : <SignedOut />}
    </div>
  }

  if (done) {
    return (
      <div className="mt-3 rounded-md bg-success-soft px-4 py-3 text-[13px] text-success">
        <p className="font-medium">Request sent — booking {done.bookingNumber}.</p>
        <p className="mt-1">The provider will accept, or send a price. You can chat once it is accepted.</p>
        <Link to={`/bookings/${done._id}`} className="mt-2 inline-block font-medium underline">
          Open this booking
        </Link>
      </div>
    )
  }

  if (offerings.length === 0) {
    return <p className="mt-3 text-[13px] text-muted">This provider has not published a service list yet.</p>
  }

  const selectedAddress = eligible.find((a) => a._id === addressId)

  function chooseOffering(id) {
    setOfferingId(id)
    setMessage('')
  }

  async function onSubmit(event) {
    event.preventDefault()
    setFieldErrors({})
    setMessage('')

    const errors = {}
    const startIso = provider.availability?.isPublished ? slot : karachiInputToIso(customStart)
    if (!startIso) errors.scheduledStart = 'Choose a date and time.'

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
    <form onSubmit={onSubmit} className="mt-3 space-y-4" noValidate>
      <div>
        <label htmlFor="service-offering" className={labelClass}>
          Service
        </label>
        <select
          id="service-offering"
          value={offering?._id || ''}
          onChange={(e) => chooseOffering(e.target.value)}
          className={`h-10 ${inputClass}`}
        >
          {offerings.map((item) => (
            <option key={item._id} value={item._id}>
              {item.title} — from {formatPrice(item.startingAtPrice / 100)}
            </option>
          ))}
        </select>
        {offering && (
          <p className="mt-1 text-[12px] text-muted">
            {durationLabel(offering.durationMinutes)} usually · price agreed with the provider
          </p>
        )}
      </div>

      <div>
        <label htmlFor="service-slot" className={labelClass}>
          Date and time <span className="normal-case tracking-normal text-muted">(Pakistan time)</span>
        </label>
        {provider.availability?.isPublished ? (
          slots.length > 0 ? (
            <select id="service-slot" value={slot} onChange={(e) => setSlot(e.target.value)} className={`h-10 ${inputClass}`} required>
              {slots.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          ) : (
            <p className="rounded-md bg-paper px-3.5 py-2.5 text-[13px] text-muted">
              No open times in the next ten days. Try another service, or check back after the provider updates their hours.
            </p>
          )
        ) : (
          <>
            <input
              id="service-slot"
              type="datetime-local"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className={`h-10 ${inputClass}`}
              required
            />
            <p className="mt-1 text-[12px] text-muted">
              This provider has not published working hours, so ask for any future time. They confirm the slot.
            </p>
          </>
        )}
        {fieldErrors.scheduledStart && <p className="mt-1 text-[12px] text-danger">{fieldErrors.scheduledStart}</p>}
      </div>

      <div>
        <p className={labelClass}>Where is the job?</p>
        {!addresses.loaded ? (
          <Skeleton className="h-16 w-full rounded-md" />
        ) : (
          <>
            {eligible.length > 0 && (
              <div className="space-y-2">
                {eligible.map((item) => (
                  <label
                    key={item._id}
                    className={`flex cursor-pointer gap-2.5 rounded-md border p-3 text-[13px] transition ${
                      mode === 'saved' && addressId === item._id ? 'border-ink bg-paper' : 'border-line bg-white'
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
                      className="mt-0.5 h-4 w-4 accent-ink"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">
                        {item.label} · {item.fullName}
                      </span>
                      <span className="block truncate text-muted">
                        {item.addressLine}, {item.city}
                      </span>
                    </span>
                  </label>
                ))}
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-line bg-white p-3 text-[13px]">
                  <input
                    type="radio"
                    name="booking-address"
                    checked={mode === 'manual'}
                    onChange={() => setMode('manual')}
                    className="h-4 w-4 accent-ink"
                  />
                  Use a different address
                </label>
              </div>
            )}
            {eligible.length === 0 && (
              <p className="mb-2 flex items-start gap-1.5 rounded-md bg-paper px-3 py-2 text-[12.5px] text-muted">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
          <CoordinatesField
            id="booking-coordinates"
            label="Pin"
            value={manual.coordinates}
            onChange={(value) => setManual((m) => ({ ...m, coordinates: value }))}
            error={fieldErrors.coordinates}
            hint="The exact spot is shared with the provider only after they accept."
            required
          />
        </div>
      )}

      <div>
        <label htmlFor="booking-note" className={labelClass}>
          Note for the provider <span className="normal-case tracking-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="booking-note"
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything they should know before quoting?"
          className={`${inputClass} py-2.5`}
        />
      </div>

      {message && (
        <p role="alert" className="rounded-md bg-clay/5 px-3 py-2 text-[13px] text-clay">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={saving || (provider.availability?.isPublished && slots.length === 0)}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-ink px-5 text-[13px] font-medium text-white transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        <CalendarClock className="h-4 w-4" aria-hidden="true" />
        {saving ? 'Sending…' : 'Request this time'}
      </button>
      <p className="text-center text-[11.5px] text-muted">
        No payment is taken here. Pay the provider at the door.
      </p>
    </form>
  )
}
