import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  MapPin,
  MessageCircle,
  Phone,
  ShieldAlert,
  Star,
  TriangleAlert,
} from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import ProductImage from '../components/ProductImage'
import Stars from '../components/Stars'
import BookingChat from '../components/services/BookingChat'
import BookingTimeline from '../components/services/BookingTimeline'
import { StatusBadge } from '../components/brand/Bits'
import { Skeleton } from '../components/ui'
import { formatPrice, inputClass, wrap } from '../ui'
import { bookingWhen, canCancel, durationLabel, priceOf } from '../utils/serviceBookings'
import { formatKarachiDateTime } from '../utils/serviceSlots'

const labelClass = 'mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted'
const primaryBtn =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-ink px-4 text-[13px] font-medium text-white transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50'
const quietBtn =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-[13px] font-medium text-ink transition hover:border-ink disabled:opacity-50'

function ProposalCard({ booking, onDone }) {
  const proposal = booking.activeProposal
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  if (!proposal) {
    return <p className="text-[13px] text-muted">The provider withdrew this proposal. Ask them for a new time in the chat.</p>
  }

  async function answer(action) {
    if (action === 'decline' && !window.confirm('Decline this proposal? The provider is told and the booking closes.')) return
    setBusy(action)
    setError('')
    try {
      const res = await api.post(`/services/bookings/${booking._id}/proposals/${action}`)
      onDone(
        res.data.booking,
        action === 'accept'
          ? 'Proposal accepted. The appointment is on the calendar and the chat is open.'
          : 'Proposal declined.',
      )
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="mt-3 rounded-md border border-warning/30 bg-warning-soft/60 p-4">
      <p className="text-[13px] font-semibold text-ink">The provider sent you a price</p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink">{formatPrice(proposal.pricePaisa / 100)}</p>
      <p className="mt-1 text-[13px] text-ink/80">{proposal.scope}</p>
      <p className="mt-2 text-[12.5px] text-muted">
        For {formatKarachiDateTime(proposal.scheduledStart)} · reply by {formatKarachiDateTime(proposal.expiresAt)}
      </p>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-clay">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => answer('accept')} disabled={Boolean(busy)} className={primaryBtn}>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {busy === 'accept' ? 'Accepting…' : 'Accept this price'}
        </button>
        <button type="button" onClick={() => answer('decline')} disabled={Boolean(busy)} className={quietBtn}>
          Decline
        </button>
      </div>
    </div>
  )
}

function CompletionActions({ booking, onDone }) {
  const [mode, setMode] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function confirm() {
    if (!window.confirm('Confirm the work is finished and the final amount is correct?')) return
    setBusy('confirm')
    setError('')
    try {
      const res = await api.post(`/services/bookings/${booking._id}/confirm`)
      onDone(res.data.booking, 'Job confirmed. Thank you — you can review the provider now.')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy('')
    }
  }

  async function dispute(event) {
    event.preventDefault()
    if (reason.trim().length < 5) return setError('Tell CityCart what went wrong.')
    setBusy('dispute')
    setError('')
    try {
      const res = await api.post(`/services/bookings/${booking._id}/dispute`, { reason: reason.trim() })
      onDone(res.data.booking, 'Your dispute was sent to CityCart. They will review it and contact both sides.')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy('')
    }
  }

  return (
    <div>
      <div className="rounded-md bg-paper px-4 py-3 text-[13px] leading-relaxed text-muted">
        The provider finished the job for <span className="font-medium text-ink">{formatPrice((booking.finalAmountPaisa ?? 0) / 100)}</span>.
        Confirm the work, or tell CityCart if something is wrong.
        {booking.autoConfirmAt && (
          <span className="mt-1 block">
            CityCart confirms automatically on {formatKarachiDateTime(booking.autoConfirmAt)} if you do nothing.
          </span>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-[13px] text-clay">{error}</p>}
      {mode === 'dispute' ? (
        <form onSubmit={dispute} className="mt-3 space-y-2">
          <label htmlFor="dispute-reason" className={labelClass}>
            What went wrong?
          </label>
          <textarea
            id="dispute-reason"
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={`${inputClass} py-2.5`}
            required
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={Boolean(busy)}
              className="inline-flex h-10 items-center rounded-md bg-danger px-4 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'dispute' ? 'Sending…' : 'Send dispute to CityCart'}
            </button>
            <button type="button" onClick={() => setMode('')} className={quietBtn}>
              Go back
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={confirm} disabled={Boolean(busy)} className={primaryBtn}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {busy === 'confirm' ? 'Confirming…' : 'Confirm the job is done'}
          </button>
          <button type="button" onClick={() => setMode('dispute')} className={`${quietBtn} text-danger`}>
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            Report a problem
          </button>
        </div>
      )}
    </div>
  )
}

function CancelBooking({ booking, onDone }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const late = ['ACCEPTED', 'IN_PROGRESS'].includes(booking.status)

  async function submit(event) {
    event.preventDefault()
    if (reason.trim().length < 3) return setError('Tell the provider why.')
    if (!window.confirm('Cancel this booking?')) return
    setBusy(true)
    setError('')
    try {
      const res = await api.post(`/services/bookings/${booking._id}/cancel`, { reason: reason.trim() })
      onDone(res.data.booking, 'Booking cancelled. The provider has been told.')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${quietBtn} w-full text-danger`}>
        Cancel this booking
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-danger/25 bg-white p-4">
      {late && (
        <p className="mb-3 flex items-start gap-2 text-[12.5px] leading-relaxed text-clay">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          The provider already accepted. This is recorded as a late cancellation.
        </p>
      )}
      <label htmlFor="cancel-reason" className={labelClass}>
        Why are you cancelling?
      </label>
      <input
        id="cancel-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        className={`h-11 ${inputClass}`}
        required
      />
      {error && <p role="alert" className="mt-2 text-[12.5px] text-clay">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-10 items-center rounded-md bg-danger px-4 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Cancelling…' : 'Yes, cancel it'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={quietBtn}>
          Keep booking
        </button>
      </div>
    </form>
  )
}

function ReviewForm({ booking, onDone }) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.post(`/services/bookings/${booking._id}/review`, {
        rating,
        ...(comment.trim() && { comment: comment.trim() }),
      })
      onDone(res.data.review)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <div>
        <p className={labelClass}>Your rating</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`}
              aria-pressed={rating === value}
              className={`flex h-9 w-9 items-center justify-center rounded-md border text-lg transition ${
                value <= rating ? 'border-clay/40 bg-clay/5 text-clay' : 'border-line text-muted/50 hover:border-ink'
              }`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="review-comment" className={labelClass}>
          Comment <span className="normal-case tracking-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="review-comment"
          rows={3}
          maxLength={2000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className={`${inputClass} py-2.5`}
          placeholder="How was the work? This appears on the provider's public page."
        />
      </div>
      {error && <p role="alert" className="text-[12.5px] text-clay">{error}</p>}
      <button type="submit" disabled={busy} className={primaryBtn}>
        <Star className="h-4 w-4" aria-hidden="true" />
        {busy ? 'Posting…' : 'Post review'}
      </button>
    </form>
  )
}

function StatusMessage({ booking }) {
  if (booking.status === 'REQUESTED') {
    return (
      <p className="text-[13px] leading-relaxed text-muted">
        Your request for {formatKarachiDateTime(booking.requestedStart)} has been sent. The provider will accept it or
        send you a price. You can chat once it is accepted.
      </p>
    )
  }
  if (booking.status === 'PROPOSED') {
    return (
      <p className="text-[13px] leading-relaxed text-muted">
        The provider sent a price and time for your request. Accept it to book the slot, or decline and tell them what
        you would prefer in the chat.
      </p>
    )
  }
  if (booking.status === 'ACCEPTED') {
    return (
      <p className="text-[13px] leading-relaxed text-muted">
        Agreed at {formatPrice((booking.agreedPricePaisa ?? 0) / 100)} for {formatKarachiDateTime(booking.scheduledStart)}.
        The provider will start the job when they arrive. Pay them at the door.
      </p>
    )
  }
  if (booking.status === 'IN_PROGRESS') {
    return (
      <p className="text-[13px] leading-relaxed text-muted">
        The job is in progress. When it is finished the provider states the final amount, and you confirm it here.
      </p>
    )
  }
  if (booking.status === 'COMPLETED') {
    return null
  }
  if (booking.status === 'CONFIRMED') {
    return (
      <p className="flex items-start gap-2 text-[13px] leading-relaxed text-success">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Confirmed{booking.confirmedBy === 'AUTO' ? ' automatically' : ''} on {formatKarachiDateTime(booking.confirmedAt)}.
        Thank you for using CityCart.
      </p>
    )
  }
  if (booking.status === 'DISPUTED') {
    return (
      <p className="flex items-start gap-2 text-[13px] leading-relaxed text-clay">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        CityCart is reviewing your dispute. They will contact both sides and record the decision here.
      </p>
    )
  }
  if (booking.cancellation) {
    return (
      <p className="text-[13px] leading-relaxed text-muted">
        Cancelled by {booking.cancellation.by.toLowerCase()} on {formatKarachiDateTime(booking.cancellation.at)}:{' '}
        {booking.cancellation.reason}
      </p>
    )
  }
  return <p className="text-[13px] text-muted">This booking is closed.</p>
}

export default function MyBookingDetail() {
  const { id } = useParams()
  const [state, setState] = useState({ id: null, booking: null, error: '' })
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    api
      .get(`/services/bookings/${id}`)
      .then((res) => active && setState({ id, booking: res.data.booking, error: '' }))
      .catch((err) => active && setState({ id, booking: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [id])

  function onDone(booking, message) {
    setState({ id, booking, error: '' })
    if (message) setNotice(message)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function onReview(review) {
    setState((s) => ({ ...s, booking: { ...s.booking, review } }))
    setNotice('Thank you — your review is now on the provider’s page.')
  }

  if (state.id !== id) {
    return (
      <div className={`${wrap} max-w-4xl space-y-4 py-10`}>
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
    )
  }

  if (!state.booking) {
    return (
      <div className={`${wrap} py-16`}>
        <p className="text-lg font-medium">{state.error}</p>
        <Link to="/bookings" className="mt-4 inline-block text-clay underline underline-offset-4">
          Back to my bookings
        </Link>
      </div>
    )
  }

  const booking = state.booking
  const provider = booking.provider || {}
  const address = booking.address || {}

  return (
    <div className={`${wrap} max-w-4xl py-10`}>
      <Link to="/bookings" className="inline-flex items-center gap-1 text-[13px] text-muted transition hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        My bookings
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {booking.offering.title}
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            {booking.bookingNumber} · requested {formatKarachiDateTime(booking.createdAt)}
          </p>
        </div>
        <StatusBadge value={booking.status} />
      </div>

      {notice && (
        <p role="status" className="mt-5 rounded-md bg-success-soft px-3.5 py-2.5 text-sm text-success">
          {notice}
        </p>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_17rem]">
        <div className="space-y-5">
          <section className="rounded-lg border border-line bg-white p-5">
            <div className="flex flex-wrap items-start gap-4">
              <ProductImage
                src={booking.offering.image}
                name={booking.offering.title}
                className="size-16 shrink-0 rounded-md text-sm"
              />
              <div className="min-w-0 flex-1 basis-48">
                <p className="font-medium text-ink">{booking.offering.title}</p>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  {durationLabel(booking.offering.durationMinutes)} · from{' '}
                  {formatPrice(booking.offering.startingAtPrice / 100)}
                </p>
                <p className="mt-2 text-[13px] text-ink">
                  <span className="text-muted">Appointment: </span>
                  {formatKarachiDateTime(bookingWhen(booking))}
                </p>
                <p className="text-[13px] text-ink">
                  <span className="text-muted">Price: </span>
                  {formatPrice(priceOf(booking) / 100)}
                </p>
              </div>
            </div>
            {booking.note && (
              <p className="mt-4 rounded-md bg-paper px-3.5 py-2.5 text-[13px] leading-relaxed text-muted">
                Your note: {booking.note}
              </p>
            )}
            {booking.completionNote && (
              <p className="mt-3 rounded-md bg-paper px-3.5 py-2.5 text-[13px] leading-relaxed text-muted">
                Provider’s note: {booking.completionNote}
              </p>
            )}
          </section>

          <section className="rounded-lg border border-line bg-white p-5">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">What happens now</h2>
            <div className="mt-3">
              <StatusMessage booking={booking} />
            </div>
            {booking.status === 'COMPLETED' && (
              <div className="mt-3">
                <CompletionActions booking={booking} onDone={onDone} />
              </div>
            )}
            {booking.status === 'PROPOSED' && (
              <div className="mt-4 border-t border-line pt-4">
                <ProposalCard booking={booking} onDone={onDone} />
              </div>
            )}
            {booking.status === 'CONFIRMED' && (
              <div className="mt-4 border-t border-line pt-4">
                <h3 className="text-[13px] font-semibold text-ink">Review {provider.displayName}</h3>
                {booking.review ? (
                  <div className="mt-2">
                    <Stars value={booking.review.rating} />
                    {booking.review.comment && (
                      <p className="mt-1 text-[13px] leading-relaxed text-muted">{booking.review.comment}</p>
                    )}
                    {booking.review.providerReply?.body && (
                      <div className="mt-2 rounded-md bg-paper px-3.5 py-2.5 text-[13px] leading-relaxed text-muted">
                        <span className="font-medium text-ink">The provider replied: </span>
                        {booking.review.providerReply.body}
                      </div>
                    )}
                  </div>
                ) : (
                  <ReviewForm booking={booking} onDone={onReview} />
                )}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-line bg-white p-5">
            <h2 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Messages
            </h2>
            <div className="mt-3">
              <BookingChat
                bookingId={booking._id}
                enabled={booking.canChat}
                closedText="Chat opens when the provider accepts your request. Until then, they reply with a proposal."
              />
            </div>
          </section>

          <section className="rounded-lg border border-line bg-white p-5">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">History</h2>
            <div className="mt-3">
              <BookingTimeline events={booking.events} />
            </div>
          </section>

          {canCancel(booking) && <CancelBooking booking={booking} onDone={onDone} />}
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-line bg-white p-5 text-[13px]">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Your provider</h2>
            {provider.slug ? (
              <Link to={`/services/${provider.slug}`} className="mt-3 flex items-center gap-3">
                <ProductImage src={provider.avatar} name={provider.displayName} className="size-10 rounded-full text-sm" />
                <span className="font-medium text-ink hover:underline">{provider.displayName}</span>
              </Link>
            ) : (
              <p className="mt-3 font-medium text-ink">{provider.displayName}</p>
            )}
            {provider.phone && (
              <p className="mt-2 flex items-center gap-2 text-muted">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                <a href={`tel:${provider.phone}`} className="hover:text-ink">
                  {provider.phone}
                </a>
              </p>
            )}
            <p className="mt-3 flex items-start gap-2 leading-relaxed text-muted">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {address.addressLine}
                <br />
                {[address.blockName, address.city].filter(Boolean).join(', ')}
              </span>
            </p>
            <p className="mt-3 flex items-center gap-2 text-[12.5px] text-muted">
              <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Pay at the door — no online payment.
            </p>
          </section>

          <Link to="/services" className={`${quietBtn} w-full`}>
            Browse services
          </Link>
        </aside>
      </div>
    </div>
  )
}
