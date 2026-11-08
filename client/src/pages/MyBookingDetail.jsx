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
import StatusPill from '../components/StatusPill'
import BookingChat from '../components/services/BookingChat'
import BookingTimeline from '../components/services/BookingTimeline'
import { EmptyState, Field, Skeleton, btn, panel, shell } from '../design'
import { formatPrice } from '../ui'
import { bookingWhen, canCancel, durationLabel, priceOf } from '../utils/serviceBookings'
import { formatKarachiDateTime } from '../utils/serviceSlots'

const sectionLabel = 'text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink/45'
const sectionTitle = 'font-display mt-2 text-[20px] font-semibold tracking-tight text-ink'

function ProposalCard({ booking, onDone }) {
  const proposal = booking.activeProposal
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  if (!proposal) {
    return (
      <p className="text-[12.5px] leading-relaxed text-ink/60">
        The provider withdrew this proposal. Ask them for a new time in the chat.
      </p>
    )
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
    <div className="rounded-panel border border-clay/25 bg-cream/70 p-4 sm:p-5">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-clay">A price from the provider</p>
      <p className="mt-1 font-display text-[28px] font-semibold leading-tight tracking-tight text-ink">
        {formatPrice(proposal.pricePaisa / 100)}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink/70">{proposal.scope}</p>
      <p className="mt-2 text-[12px] text-ink/55">
        For {formatKarachiDateTime(proposal.scheduledStart)} · reply by {formatKarachiDateTime(proposal.expiresAt)}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-clay">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => answer('accept')} disabled={Boolean(busy)} className={btn('primary', 'sm')}>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {busy === 'accept' ? 'Accepting…' : 'Accept this price'}
        </button>
        <button type="button" onClick={() => answer('decline')} disabled={Boolean(busy)} className={btn('outline', 'sm')}>
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
      <div className="rounded-tile bg-canvas px-4 py-3 text-[12.5px] leading-relaxed text-ink/60">
        The provider finished the job for{' '}
        <span className="font-semibold text-ink">{formatPrice((booking.finalAmountPaisa ?? 0) / 100)}</span>. Confirm
        the work, or tell CityCart if something is wrong.
        {booking.autoConfirmAt && (
          <span className="mt-1 block text-ink/45">
            CityCart confirms automatically on {formatKarachiDateTime(booking.autoConfirmAt)} if you do nothing.
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-clay">
          {error}
        </p>
      )}
      {mode === 'dispute' ? (
        <form onSubmit={dispute} className="mt-4 space-y-3">
          <Field
            as="textarea"
            label="What went wrong?"
            id="dispute-reason"
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={Boolean(busy)} className={btn('primary', 'md')}>
              {busy === 'dispute' ? 'Sending…' : 'Send dispute to CityCart'}
            </button>
            <button type="button" onClick={() => setMode('')} className={btn('outline', 'md')}>
              Go back
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={confirm} disabled={Boolean(busy)} className={btn('primary', 'md')}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {busy === 'confirm' ? 'Confirming…' : 'Confirm the job is done'}
          </button>
          <button type="button" onClick={() => setMode('dispute')} className={`${btn('outline', 'md')} text-clay`}>
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
      <button type="button" onClick={() => setOpen(true)} className={`${btn('outline', 'md')} w-full text-clay`}>
        Cancel this booking
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-panel border border-clay/25 bg-paper-warm p-5">
      {late && (
        <p className="mb-3 flex items-start gap-2 text-[12.5px] leading-relaxed text-clay">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          The provider already accepted. This is recorded as a late cancellation.
        </p>
      )}
      <Field
        label="Why are you cancelling?"
        id="cancel-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        required
      />
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-clay">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={btn('primary', 'md')}>
          {busy ? 'Cancelling…' : 'Yes, cancel it'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btn('outline', 'md')}>
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
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">Your rating</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`}
              aria-pressed={rating === value}
              className={`flex h-9 w-9 items-center justify-center rounded-tile border text-lg transition ${
                value <= rating ? 'border-clay/40 bg-clay/5 text-clay' : 'border-line-warm text-ink/25 hover:border-clay/40'
              }`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <Field
        as="textarea"
        label="Comment"
        id="review-comment"
        rows={3}
        maxLength={2000}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        hint="Optional. This appears on the provider's public page."
      />
      {error && (
        <p role="alert" className="text-[12.5px] text-clay">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={btn('primary', 'sm')}>
        <Star className="h-3.5 w-3.5" aria-hidden="true" />
        {busy ? 'Posting…' : 'Post review'}
      </button>
    </form>
  )
}

function StatusMessage({ booking }) {
  if (booking.status === 'REQUESTED') {
    return (
      <p className="text-[12.5px] leading-relaxed text-ink/60">
        Your request for {formatKarachiDateTime(booking.requestedStart)} has been sent.
        {booking.customerOfferPaisa != null ? (
          <>
            {' '}
            You offered {formatPrice(booking.customerOfferPaisa / 100)} for the whole job — the provider can accept it,
            decline it, or send a counter-offer.
          </>
        ) : (
          ' The provider will accept it or send you a price.'
        )}{' '}
        You can chat once it is accepted.
      </p>
    )
  }
  if (booking.status === 'DECLINED') {
    return (
      <p className="text-[12.5px] leading-relaxed text-ink/60">
        The provider declined this request
        {booking.cancellation?.reason ? `: ${booking.cancellation.reason}` : '.'} You can ask another provider for the
        same job.
      </p>
    )
  }
  if (booking.status === 'PROPOSED') {
    return (
      <p className="text-[12.5px] leading-relaxed text-ink/60">
        The provider sent a price and time for your request. Accept it to book the slot, or decline and tell them what
        you would prefer in the chat.
      </p>
    )
  }
  if (booking.status === 'ACCEPTED') {
    return (
      <p className="text-[12.5px] leading-relaxed text-ink/60">
        Agreed at {formatPrice((booking.agreedPricePaisa ?? 0) / 100)} for {formatKarachiDateTime(booking.scheduledStart)}.
        The provider will start the job when they arrive. Pay them at the door.
      </p>
    )
  }
  if (booking.status === 'IN_PROGRESS') {
    return (
      <p className="text-[12.5px] leading-relaxed text-ink/60">
        The job is in progress. When it is finished the provider states the final amount, and you confirm it here.
      </p>
    )
  }
  if (booking.status === 'COMPLETED') {
    return null
  }
  if (booking.status === 'CONFIRMED') {
    return (
      <p className="flex items-start gap-2 rounded-tile bg-sage/40 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-forest">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Confirmed{booking.confirmedBy === 'AUTO' ? ' automatically' : ''} on {formatKarachiDateTime(booking.confirmedAt)}.
        Thank you for using CityCart.
      </p>
    )
  }
  if (booking.status === 'DISPUTED') {
    return (
      <p className="flex items-start gap-2 rounded-tile bg-clay/5 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-clay">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        CityCart is reviewing your dispute. They will contact both sides and record the decision here.
      </p>
    )
  }
  if (booking.cancellation) {
    return (
      <p className="text-[12.5px] leading-relaxed text-ink/60">
        Cancelled by {booking.cancellation.by.toLowerCase()} on {formatKarachiDateTime(booking.cancellation.at)}:{' '}
        {booking.cancellation.reason}
      </p>
    )
  }
  return <p className="text-[12.5px] text-ink/60">This booking is closed.</p>
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
      <div className="bg-canvas">
        <div className={`${shell} max-w-[1000px] space-y-4 pb-16 pt-8`}>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-40 w-full rounded-panel" />
          <Skeleton className="h-56 w-full rounded-panel" />
        </div>
      </div>
    )
  }

  if (!state.booking) {
    return (
      <div className="bg-canvas">
        <div className={`${shell} py-16`}>
          <EmptyState
            icon={CalendarCheck}
            title="Booking not found"
            message={state.error || 'This booking is not available on your account.'}
            action={
              <Link to="/bookings" className={btn('noir', 'md')}>
                My bookings
              </Link>
            }
          />
        </div>
      </div>
    )
  }

  const booking = state.booking
  const provider = booking.provider || {}
  const address = booking.address || {}

  return (
    <div className="bg-canvas">
      <div className={`${shell} max-w-[1000px] pb-16 pt-6 sm:pt-8`}>
        <Link
          to="/bookings"
          className="inline-flex items-center gap-1.5 text-[12px] text-ink/50 transition hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          My bookings
        </Link>

        <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink/45">
              Booking {booking.bookingNumber}
            </p>
            <h1 className="font-display mt-2 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[34px]">
              {booking.offering.title}
            </h1>
            <p className="mt-2 text-[12.5px] text-ink/55">
              Requested {formatKarachiDateTime(booking.createdAt)}
            </p>
          </div>
          <StatusPill value={booking.status} />
        </header>

        {notice && (
          <p
            role="status"
            className="mt-5 rounded-tile border border-sage bg-sage/40 px-3.5 py-2.5 text-[12.5px] text-forest"
          >
            {notice}
          </p>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_19rem] lg:gap-8">
          <div className="space-y-4">
            <section className={`${panel} p-5 sm:p-6`}>
              <div className="flex flex-wrap items-start gap-4">
                <ProductImage
                  src={booking.offering.image}
                  name={booking.offering.title}
                  className="size-16 shrink-0 rounded-tile text-sm"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-[18px] font-semibold tracking-tight text-ink">
                    {booking.offering.title}
                  </h2>
                  <p className="mt-1 text-[12px] text-ink/55">
                    {durationLabel(booking.offering.durationMinutes)} · from{' '}
                    {formatPrice(booking.offering.startingAtPrice / 100)}
                  </p>
                  <dl className="mt-4 grid gap-3 border-t border-line-warm pt-4 text-[12.5px] sm:grid-cols-2">
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/40">Appointment</dt>
                      <dd className="mt-1 font-medium text-ink">{formatKarachiDateTime(bookingWhen(booking))}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/40">Price</dt>
                      <dd className="mt-1 font-medium text-ink">{formatPrice(priceOf(booking) / 100)}</dd>
                    </div>
                    {booking.customerOfferPaisa != null && (
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/40">Your offer</dt>
                        <dd className="mt-1 font-medium text-ink">
                          {formatPrice(booking.customerOfferPaisa / 100)}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
              {booking.note && (
                <p className="mt-4 rounded-tile bg-canvas px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink/60">
                  <span className="font-medium text-ink/70">Your note: </span>
                  {booking.note}
                </p>
              )}
              {booking.completionNote && (
                <p className="mt-2 rounded-tile bg-canvas px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink/60">
                  <span className="font-medium text-ink/70">Provider’s note: </span>
                  {booking.completionNote}
                </p>
              )}
            </section>

            <section className={`${panel} p-5 sm:p-6`}>
              <p className={sectionLabel}>What happens now</p>
              <h2 className={sectionTitle}>Next step</h2>
              <div className="mt-3">
                <StatusMessage booking={booking} />
              </div>
              {booking.status === 'COMPLETED' && (
                <div className="mt-4">
                  <CompletionActions booking={booking} onDone={onDone} />
                </div>
              )}
              {booking.status === 'PROPOSED' && (
                <div className="mt-4">
                  <ProposalCard booking={booking} onDone={onDone} />
                </div>
              )}
              {booking.status === 'CONFIRMED' && (
                <div className="mt-4 border-t border-line-warm pt-4">
                  <h3 className="text-[13px] font-semibold text-ink">Review {provider.displayName}</h3>
                  {booking.review ? (
                    <div className="mt-2">
                      <Stars value={booking.review.rating} />
                      {booking.review.comment && (
                        <p className="mt-1.5 text-[13px] leading-relaxed text-ink/65">{booking.review.comment}</p>
                      )}
                      {booking.review.providerReply?.body && (
                        <div className="mt-2 rounded-tile bg-canvas px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink/60">
                          <span className="font-semibold text-ink">The provider replied: </span>
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

            <section className={`${panel} p-5 sm:p-6`}>
              <h2 className="flex items-center gap-2 font-display text-[20px] font-semibold tracking-tight text-ink">
                <MessageCircle className="h-4 w-4 text-clay" aria-hidden="true" />
                Messages
              </h2>
              <p className="mt-1 text-[12px] text-ink/50">
                {booking.canChat ? 'Private chat about this booking.' : 'Chat opens when the provider accepts.'}
              </p>
              <div className="mt-4">
                <BookingChat
                  bookingId={booking._id}
                  enabled={booking.canChat}
                  closedText="Chat opens when the provider accepts your request. Until then, they reply with a proposal."
                />
              </div>
            </section>

            <section className={`${panel} p-5 sm:p-6`}>
              <h2 className="font-display text-[20px] font-semibold tracking-tight text-ink">History</h2>
              <div className="mt-4">
                <BookingTimeline events={booking.events} />
              </div>
            </section>

            {canCancel(booking) && <CancelBooking booking={booking} onDone={onDone} />}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <section className={`${panel} p-5`}>
              <p className={sectionLabel}>Your provider</p>
              {provider.slug ? (
                <Link to={`/services/${provider.slug}`} className="mt-3 flex items-center gap-3">
                  <ProductImage src={provider.avatar} name={provider.displayName} className="size-11 rounded-full text-sm" />
                  <span className="font-display text-[17px] font-semibold tracking-tight text-ink hover:text-clay">
                    {provider.displayName}
                  </span>
                </Link>
              ) : (
                <p className="mt-3 font-display text-[17px] font-semibold tracking-tight text-ink">
                  {provider.displayName}
                </p>
              )}
              {provider.phone && (
                <p className="mt-3 flex items-center gap-2 text-[12.5px] text-ink/60">
                  <Phone className="h-3.5 w-3.5 text-clay" aria-hidden="true" />
                  <a href={`tel:${provider.phone}`} className="transition hover:text-ink">
                    {provider.phone}
                  </a>
                </p>
              )}
              <p className="mt-2.5 flex items-start gap-2 text-[12.5px] leading-relaxed text-ink/60">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-clay" aria-hidden="true" />
                <span>
                  {address.addressLine}
                  <br />
                  {[address.blockName, address.city].filter(Boolean).join(', ')}
                </span>
              </p>
              <p className="mt-3 flex items-center gap-2 border-t border-line-warm pt-3 text-[11.5px] text-ink/50">
                <CalendarCheck className="h-3.5 w-3.5 text-clay" aria-hidden="true" />
                Pay at the door — no online payment.
              </p>
            </section>

            <Link to="/services" className={`${btn('outline', 'md')} w-full`}>
              Browse services
            </Link>
          </aside>
        </div>
      </div>
    </div>
  )
}
