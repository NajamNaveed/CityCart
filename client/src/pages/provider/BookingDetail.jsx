import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  MapPin,
  MessageCircle,
  Phone,
  Play,
  Send,
  XCircle,
} from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import BookingChat from '../../components/services/BookingChat'
import BookingTimeline from '../../components/services/BookingTimeline'
import { Notice, StatusBadge } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import { formatPrice, inputClass } from '../../ui'
import {
  bookingWhen,
  canCancel,
  durationLabel,
  priceOf,
  toPaisa,
  toRupees,
} from '../../utils/serviceBookings'
import { formatKarachiDateTime, isoToKarachiInput, karachiInputToIso } from '../../utils/serviceSlots'

const labelClass = 'mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink/55'
const actionBtn =
  'inline-flex h-10 items-center justify-center gap-2 rounded-tile bg-forest px-4 text-[13px] font-medium text-cream transition hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-50'
const quietBtn =
  'inline-flex h-10 items-center justify-center gap-2 rounded-tile border border-line-warm bg-paper-warm px-4 text-[13px] font-medium text-ink transition hover:border-ink disabled:opacity-50'

function FieldGroup({ label, hint, htmlFor, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11.5px] text-ink/55">{hint}</p>}
    </div>
  )
}

function AcceptForm({ booking, onDone }) {
  const [price, setPrice] = useState(toRupees(booking.offering.startingAtPrice))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    const pricePaisa = toPaisa(price)
    if (pricePaisa === null) {
      setError('Enter the price in rupees.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await api.post(`/services/provider/bookings/${booking._id}/accept`, { pricePaisa })
      onDone(res.data.booking, 'Booking accepted. You can chat with the customer now.')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FieldGroup
        label="Agreed price (Rs)"
        htmlFor="accept-price"
        hint={`Cannot be below your published starting price of ${formatPrice(booking.offering.startingAtPrice / 100)}.`}
      >
        <input
          id="accept-price"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={`h-11 ${inputClass}`}
          required
        />
      </FieldGroup>
      {error && <p role="alert" className="text-[13px] text-clay">{error}</p>}
      <button type="submit" disabled={saving} className={actionBtn}>
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        {saving ? 'Accepting…' : 'Accept at the requested time'}
      </button>
    </form>
  )
}

function ProposeForm({ booking, onDone }) {
  const active = booking.activeProposal
  const [price, setPrice] = useState(toRupees(active?.pricePaisa ?? booking.offering.startingAtPrice))
  const [scope, setScope] = useState(active?.scope || '')
  const [start, setStart] = useState(isoToKarachiInput(active?.scheduledStart || booking.requestedStart))
  const [hours, setHours] = useState('24')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    const pricePaisa = toPaisa(price)
    const scheduledStart = karachiInputToIso(start)
    const expiresInHours = Number(hours)
    if (pricePaisa === null) return setError('Enter the price in rupees.')
    if (scope.trim().length < 3) return setError('Describe what the price includes.')
    if (!scheduledStart) return setError('Choose a date and time.')
    if (!Number.isInteger(expiresInHours) || expiresInHours < 1 || expiresInHours > 72) {
      return setError('The proposal must stay open for 1 to 72 hours.')
    }
    setSaving(true)
    setError('')
    try {
      const res = await api.post(`/services/provider/bookings/${booking._id}/propose`, {
        pricePaisa,
        scope: scope.trim(),
        scheduledStart,
        expiresInHours,
      })
      onDone(res.data.booking, active ? 'New proposal sent. The earlier one is withdrawn.' : 'Proposal sent.')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldGroup label="Your price (Rs)" htmlFor="propose-price">
          <input
            id="propose-price"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={`h-11 ${inputClass}`}
            required
          />
        </FieldGroup>
        <FieldGroup label="Time (Pakistan time)" htmlFor="propose-start">
          <input
            id="propose-start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={`h-11 ${inputClass}`}
            required
          />
        </FieldGroup>
      </div>
      <FieldGroup label="What the price includes" htmlFor="propose-scope" hint="The customer sees this before accepting.">
        <textarea
          id="propose-scope"
          rows={3}
          maxLength={1000}
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className={`${inputClass} py-2.5`}
          required
        />
      </FieldGroup>
      <FieldGroup label="Proposal stays open (hours)" htmlFor="propose-hours" hint="Between 1 and 72 hours.">
        <input
          id="propose-hours"
          type="number"
          min="1"
          max="72"
          step="1"
          inputMode="numeric"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className={`h-11 ${inputClass}`}
          required
        />
      </FieldGroup>
      {error && <p role="alert" className="text-[13px] text-clay">{error}</p>}
      <button type="submit" disabled={saving} className={actionBtn}>
        <Send className="h-4 w-4" aria-hidden="true" />
        {saving ? 'Sending…' : active ? 'Send a new proposal' : 'Send proposal'}
      </button>
    </form>
  )
}

function CompleteForm({ booking, onDone }) {
  const [amount, setAmount] = useState(toRupees(booking.agreedPricePaisa ?? priceOf(booking)))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    const finalAmountPaisa = toPaisa(amount)
    if (finalAmountPaisa === null) return setError('Enter the final amount in rupees.')
    setSaving(true)
    setError('')
    try {
      const res = await api.post(`/services/provider/bookings/${booking._id}/complete`, {
        finalAmountPaisa,
        ...(note.trim() && { completionNote: note.trim() }),
      })
      onDone(res.data.booking, 'Job completed. The customer will confirm the final amount.')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FieldGroup label="Final amount (Rs)" htmlFor="complete-amount" hint="The customer confirms this amount.">
        <input
          id="complete-amount"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={`h-11 ${inputClass}`}
          required
        />
      </FieldGroup>
      <FieldGroup label="Completion note (optional)" htmlFor="complete-note">
        <textarea
          id="complete-note"
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={`${inputClass} py-2.5`}
          placeholder="Anything the customer should know about the work."
        />
      </FieldGroup>
      {error && <p role="alert" className="text-[13px] text-clay">{error}</p>}
      <button type="submit" disabled={saving} className={actionBtn}>
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        {saving ? 'Completing…' : 'Mark job complete'}
      </button>
    </form>
  )
}

function CancelForm({ booking, onDone }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (reason.trim().length < 3) return setError('Tell the customer why.')
    setSaving(true)
    setError('')
    try {
      const res = await api.post(`/services/provider/bookings/${booking._id}/cancel`, { reason: reason.trim() })
      onDone(res.data.booking, 'Booking cancelled.')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${quietBtn} text-clay`}>
        <XCircle className="h-4 w-4" aria-hidden="true" />
        Cancel booking
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-tile border border-clay/25 bg-clay/10 p-4">
      <FieldGroup label="Why are you cancelling?" htmlFor="cancel-reason">
        <input
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          className={`h-11 ${inputClass}`}
          required
        />
      </FieldGroup>
      {error && <p role="alert" className="text-[13px] text-clay">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-10 items-center rounded-tile bg-clay px-4 text-[13px] font-medium text-cream transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Cancelling…' : 'Yes, cancel it'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={quietBtn}>
          Keep booking
        </button>
      </div>
    </form>
  )
}

function StartButton({ booking, onDone }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function start() {
    setSaving(true)
    setError('')
    try {
      const res = await api.post(`/services/provider/bookings/${booking._id}/start`)
      onDone(res.data.booking, 'Job started. The customer has been told.')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <button type="button" onClick={start} disabled={saving} className={actionBtn}>
        <Play className="h-4 w-4" aria-hidden="true" />
        {saving ? 'Starting…' : 'Start the job'}
      </button>
      {error && <p role="alert" className="mt-2 text-[13px] text-clay">{error}</p>}
    </div>
  )
}

function StatusPanel({ booking, onDone }) {
  if (booking.status === 'REQUESTED') {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Accept the requested time</h3>
          <p className="mt-1 text-[13px] text-ink/55">The price you set here is what both sides are bound to.</p>
          <div className="mt-4">
            <AcceptForm booking={booking} onDone={onDone} />
          </div>
        </div>
        <div className="border-t border-line-warm pt-5">
          <h3 className="text-[15px] font-semibold text-ink">Or propose another time and price</h3>
          <p className="mt-1 text-[13px] text-ink/55">The customer accepts or declines. They can reply in the chat afterwards.</p>
          <div className="mt-4">
            <ProposeForm booking={booking} onDone={onDone} />
          </div>
        </div>
      </div>
    )
  }

  if (booking.status === 'PROPOSED') {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-ink/55">
          Waiting for the customer to accept or decline. You can send a revised proposal if something changed.
        </p>
        <ProposeForm booking={booking} onDone={onDone} />
      </div>
    )
  }

  if (booking.status === 'ACCEPTED') {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-ink/55">
          Agreed at {formatPrice((booking.agreedPricePaisa ?? 0) / 100)} for{' '}
          {formatKarachiDateTime(booking.scheduledStart)}. Start the job when you arrive.
        </p>
        <StartButton booking={booking} onDone={onDone} />
      </div>
    )
  }

  if (booking.status === 'IN_PROGRESS') {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-ink/55">Started {formatKarachiDateTime(booking.startedAt)}. State the final amount at the end.</p>
        <CompleteForm booking={booking} onDone={onDone} />
      </div>
    )
  }

  if (booking.status === 'COMPLETED') {
    return (
      <p className="text-[13px] leading-relaxed text-ink/55">
        Final amount {formatPrice((booking.finalAmountPaisa ?? 0) / 100)} sent. The customer confirms, or CityCart
        confirms automatically on {formatKarachiDateTime(booking.autoConfirmAt)}.
      </p>
    )
  }

  if (booking.status === 'CONFIRMED') {
    return (
      <p className="flex items-start gap-2 text-[13px] leading-relaxed text-forest">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Confirmed{booking.confirmedBy === 'AUTO' ? ' automatically' : ''} on {formatKarachiDateTime(booking.confirmedAt)}.
      </p>
    )
  }

  if (booking.status === 'DISPUTED') {
    return (
      <div className="rounded-tile border border-[#e5d2a9] bg-[#f8efd9] px-4 py-3 text-[13px] leading-relaxed text-[#855811]">
        <p className="font-medium text-ink">The customer disputed this booking</p>
        {booking.dispute?.reason && <p className="mt-1">{booking.dispute.reason}</p>}
        <p className="mt-1">CityCart is reviewing it. You can reply in the chat.</p>
      </div>
    )
  }

  if (booking.cancellation) {
    return (
      <p className="text-[13px] leading-relaxed text-ink/55">
        Cancelled by {booking.cancellation.by.toLowerCase()} on {formatKarachiDateTime(booking.cancellation.at)}:{' '}
        {booking.cancellation.reason}
      </p>
    )
  }

  return <p className="text-[13px] text-ink/55">This booking is closed.</p>
}

export default function ProviderBookingDetail() {
  const { id } = useParams()
  const [state, setState] = useState({ id: null, booking: null, error: '' })
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    api
      .get(`/services/provider/bookings/${id}`)
      .then((res) => active && setState({ id, booking: res.data.booking, error: '' }))
      .catch((err) => active && setState({ id, booking: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [id])

  function onDone(booking, message) {
    setState({ id, booking, error: '' })
    setNotice(message)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (state.id !== id) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-32 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    )
  }

  if (!state.booking) {
    return (
      <div>
        <p role="alert" className="rounded-tile border border-clay/20 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">{state.error}</p>
        <Link to="/provider/bookings" className="mt-4 inline-block text-[13px] font-medium underline underline-offset-4">
          Back to bookings
        </Link>
      </div>
    )
  }

  const booking = state.booking
  const address = booking.address || {}

  return (
    <>
      <Link
        to="/provider/bookings"
        className="inline-flex items-center gap-1 text-[13px] text-ink/55 transition hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Bookings
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{booking.bookingNumber}</h1>
          <p className="mt-1 text-[13px] text-ink/55">
            {booking.offering.title} · {durationLabel(booking.offering.durationMinutes)} · requested{' '}
            {formatKarachiDateTime(booking.createdAt)}
          </p>
        </div>
        <StatusBadge value={booking.status} />
      </div>
      <Notice>{notice}</Notice>

      <div className="grid gap-6 lg:grid-cols-[1fr_19rem]">
        <div className="space-y-5">
          <section className="rounded-card border border-line-warm bg-paper-warm p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink/55">Appointment</p>
                <p className="mt-1.5 text-[15px] font-semibold text-ink">
                  {formatKarachiDateTime(bookingWhen(booking))}
                </p>
                <p className="mt-0.5 text-[12.5px] text-ink/55">
                  Requested {formatKarachiDateTime(booking.requestedStart)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink/55">Price</p>
                <p className="mt-1.5 text-[15px] font-semibold text-ink">{formatPrice(priceOf(booking) / 100)}</p>
                <p className="mt-0.5 text-[12.5px] text-ink/55">
                  From {formatPrice(booking.offering.startingAtPrice / 100)}
                </p>
              </div>
            </div>
            {booking.note && (
              <p className="mt-4 rounded-tile bg-sand/50 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink/55">
                Customer note: {booking.note}
              </p>
            )}
            {booking.completionNote && (
              <p className="mt-3 rounded-tile bg-sand/50 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink/55">
                Your completion note: {booking.completionNote}
              </p>
            )}
          </section>

          <section className="rounded-card border border-line-warm bg-paper-warm p-5">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">Next step</h2>
            <div className="mt-3">
              <StatusPanel booking={booking} onDone={onDone} />
            </div>
          </section>

          <section className="rounded-card border border-line-warm bg-paper-warm p-5">
            <h2 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Messages
            </h2>
            <div className="mt-3">
              <BookingChat
                bookingId={booking._id}
                enabled={booking.canChat}
                closedText="Chat opens once you accept the booking. You can still send a proposal meanwhile."
              />
            </div>
          </section>

          {booking.proposals.length > 0 && (
            <section className="rounded-card border border-line-warm bg-paper-warm p-5">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">Proposals</h2>
              <ul className="mt-3 space-y-3">
                {[...booking.proposals].reverse().map((proposal) => (
                  <li key={proposal._id} className="rounded-tile border border-line-warm px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-ink">{formatPrice(proposal.pricePaisa / 100)}</span>
                      <StatusBadge value={proposal.status} />
                    </div>
                    <p className="mt-1 text-[12.5px] text-ink/55">
                      {formatKarachiDateTime(proposal.scheduledStart)} · open until{' '}
                      {formatKarachiDateTime(proposal.expiresAt)}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink/80">{proposal.scope}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-card border border-line-warm bg-paper-warm p-5">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">History</h2>
            <div className="mt-3">
              <BookingTimeline events={booking.events} />
            </div>
          </section>

          {canCancel(booking) && <CancelForm booking={booking} onDone={onDone} />}
        </div>

        <aside className="space-y-4">
          <section className="rounded-card border border-line-warm bg-paper-warm p-5 text-[13px]">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">Customer</h2>
            <p className="mt-3 flex items-center gap-2 font-medium text-ink">
              {address.fullName}
            </p>
            <p className="mt-1 flex items-center gap-2 text-ink/55">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              <a href={`tel:${address.phone}`} className="hover:text-ink">
                {address.phone}
              </a>
            </p>
            <p className="mt-3 flex items-start gap-2 leading-relaxed text-ink/85">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink/55" aria-hidden="true" />
              <span>
                {address.addressLine}
                <br />
                {[address.blockName, address.city].filter(Boolean).join(', ')}
              </span>
            </p>
            {address.pin && (
              <a
                href={`https://www.google.com/maps?q=${address.pin.lat},${address.pin.lng}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-forest hover:underline"
              >
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                Open the pin in Maps
              </a>
            )}
          </section>

          <p className="rounded-tile bg-sand/50 px-4 py-3 text-[12.5px] leading-relaxed text-ink/55">
            No online payment is taken. The customer pays you at the door, by cash or whatever method you both agree.
          </p>
        </aside>
      </div>
    </>
  )
}
