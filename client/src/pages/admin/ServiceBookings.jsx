import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarClock, MessageCircle, ShieldAlert, X } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { Notice, PageHeader, Pager, StatusBadge, selectClass, tableHead, tableRow, tableShell } from '../../components/brand/Bits'
import BookingTimeline from '../../components/services/BookingTimeline'
import { EmptyState, Skeleton } from '../../components/ui'
import { formatPrice, humanize, inputClass } from '../../ui'
import { BOOKING_STATUSES, bookingWhen, durationLabel, priceOf } from '../../utils/serviceBookings'
import { formatKarachiDateTime } from '../../utils/serviceSlots'

function ResolveDispute({ booking, onDone }) {
  const [resolution, setResolution] = useState('CONFIRMED')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (!window.confirm(`Resolve this dispute as ${resolution.toLowerCase()}?`)) return
    setBusy(true)
    setError('')
    try {
      const res = await api.patch(`/admin/service-bookings/${booking._id}/dispute`, {
        resolution,
        ...(note.trim() && { note: note.trim() }),
      })
      onDone(res.data.booking, res.data.message)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-md border border-danger/25 bg-danger-soft/40 p-4">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        <ShieldAlert className="h-4 w-4 text-danger" aria-hidden="true" />
        Dispute open
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink/80">{booking.dispute?.reason}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="resolution" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
            Outcome
          </label>
          <select id="resolution" value={resolution} onChange={(e) => setResolution(e.target.value)} className={`h-10 w-full ${selectClass}`}>
            <option value="CONFIRMED">Job confirmed — customer pays</option>
            <option value="CANCELLED">Booking cancelled</option>
          </select>
        </div>
        <div>
          <label htmlFor="resolution-note" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
            Note (optional)
          </label>
          <input
            id="resolution-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            className={`h-10 w-full ${inputClass}`}
            placeholder="Shown in the booking history"
          />
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-clay">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-3 inline-flex h-10 items-center rounded-md bg-danger px-4 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Resolving…' : 'Resolve dispute'}
      </button>
    </form>
  )
}

function AdminMessages({ bookingId }) {
  const [state, setState] = useState({ key: null, messages: [], error: '' })
  const key = bookingId

  useEffect(() => {
    let active = true
    api
      .get(`/admin/service-bookings/${bookingId}/messages`, { params: { limit: 50 } })
      .then((res) => active && setState({ key, messages: res.data.messages, error: '' }))
      .catch((err) => active && setState({ key, messages: [], error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [bookingId, key])

  if (state.key !== key) return <Skeleton className="h-24 w-full rounded-md" />
  if (state.error) return <p className="text-[13px] text-clay">{state.error}</p>
  if (state.messages.length === 0) return <p className="text-[13px] text-muted">No messages on this booking yet.</p>

  return (
    <ul className="space-y-2">
      {state.messages.map((m) => (
        <li key={m._id} className="rounded-md bg-paper px-3.5 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            {humanize(m.senderRole)} · {formatKarachiDateTime(m.createdAt)}
          </p>
          <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink">{m.body}</p>
        </li>
      ))}
    </ul>
  )
}

function BookingDetail({ id, onClose, onChanged }) {
  const [state, setState] = useState({ id: null, booking: null, error: '' })

  useEffect(() => {
    let active = true
    api
      .get(`/admin/service-bookings/${id}`)
      .then((res) => active && setState({ id, booking: res.data.booking, error: '' }))
      .catch((err) => active && setState({ id, booking: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [id])

  function onDone(booking, message) {
    setState((s) => ({ ...s, booking }))
    onChanged(booking, message)
  }

  if (state.id !== id) return <Skeleton className="h-64 w-full rounded-lg" />
  if (!state.booking) return <p className="text-[13px] text-clay">{state.error}</p>

  const booking = state.booking
  const address = booking.address || {}

  return (
    <section className="rounded-lg border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{booking.bookingNumber}</p>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-ink">{booking.offering.title}</h2>
          <p className="mt-1 text-[13px] text-muted">
            {booking.provider?.displayName} for {booking.customer?.name} · requested {formatKarachiDateTime(booking.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge value={booking.status} />
          <button type="button" onClick={onClose} aria-label="Close booking" className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-paper hover:text-ink">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-muted">Appointment</dt>
          <dd className="text-ink">{formatKarachiDateTime(bookingWhen(booking))}</dd>
        </div>
        <div>
          <dt className="text-muted">Duration</dt>
          <dd className="text-ink">{durationLabel(booking.offering.durationMinutes)}</dd>
        </div>
        <div>
          <dt className="text-muted">Price</dt>
          <dd className="text-ink">
            {formatPrice(priceOf(booking) / 100)}
            {booking.agreedPricePaisa != null && (
              <span className="text-muted"> agreed · from {formatPrice(booking.offering.startingAtPrice / 100)}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Final amount</dt>
          <dd className="text-ink">{booking.finalAmountPaisa != null ? formatPrice(booking.finalAmountPaisa / 100) : '—'}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted">Address</dt>
          <dd className="text-ink">
            {address.fullName} · {address.phone}
            <br />
            {address.addressLine}
            {[address.blockName, address.city].filter(Boolean).length > 0 && (
              <>
                <br />
                {[address.blockName, address.city].filter(Boolean).join(', ')}
              </>
            )}
          </dd>
        </div>
        {booking.note && (
          <div className="sm:col-span-2">
            <dt className="text-muted">Customer note</dt>
            <dd className="text-ink">{booking.note}</dd>
          </div>
        )}
        {booking.completionNote && (
          <div className="sm:col-span-2">
            <dt className="text-muted">Provider completion note</dt>
            <dd className="text-ink">{booking.completionNote}</dd>
          </div>
        )}
        {booking.cancellation && (
          <div className="sm:col-span-2">
            <dt className="text-muted">Cancellation</dt>
            <dd className="text-ink">
              {humanize(booking.cancellation.by)} on {formatKarachiDateTime(booking.cancellation.at)}: {booking.cancellation.reason}
              {booking.cancellation.late ? ' (late)' : ''}
            </dd>
          </div>
        )}
        {booking.dispute?.resolvedAt && (
          <div className="sm:col-span-2">
            <dt className="text-muted">Dispute resolution</dt>
            <dd className="text-ink">
              {humanize(booking.dispute.resolution || '')} on {formatKarachiDateTime(booking.dispute.resolvedAt)}
              {booking.dispute.resolutionNote ? ` — ${booking.dispute.resolutionNote}` : ''}
            </dd>
          </div>
        )}
      </dl>

      {booking.status === 'DISPUTED' && <ResolveDispute booking={booking} onDone={onDone} />}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Messages (read-only)
          </h3>
          <div className="mt-3">
            <AdminMessages bookingId={booking._id} />
          </div>
        </div>
        <div>
          <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">History</h3>
          <div className="mt-3">
            <BookingTimeline events={booking.events} />
          </div>
        </div>
      </div>
    </section>
  )
}

export default function ServiceBookings() {
  const [params, setParams] = useSearchParams()
  const status = BOOKING_STATUSES.includes(params.get('status')) ? params.get('status') : ''
  const disputed = params.get('disputed') === 'true'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const selected = params.get('booking') || ''

  const [state, setState] = useState({ key: null, bookings: [], pagination: null, error: '' })
  const [message, setMessage] = useState({ text: '', tone: 'ok' })
  const key = JSON.stringify([status, disputed, page])

  useEffect(() => {
    let active = true
    api
      .get('/admin/service-bookings', {
        params: { limit: 20, page, ...(status && { status }), ...(disputed && { disputed: 'true' }) },
      })
      .then((res) => active && setState({ key, bookings: res.data.bookings, pagination: res.data.pagination, error: '' }))
      .catch((err) => active && setState({ key, bookings: [], pagination: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [status, disputed, page, key])

  function update(patch) {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...patch }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next)
  }

  function onChanged(booking, text) {
    setState((s) => ({
      ...s,
      bookings: s.bookings.map((b) => (b._id === booking._id ? booking : b)),
    }))
    setMessage({ text, tone: 'ok' })
  }

  const loading = state.key !== key

  return (
    <>
      <PageHeader title="Service bookings" intro="Every provider job on the platform, including disputes and the booking chat." />
      <Notice tone={message.tone}>{message.text}</Notice>

      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <label htmlFor="status" className="sr-only">
          Status
        </label>
        <select id="status" value={status} onChange={(e) => update({ status: e.target.value })} className={selectClass}>
          <option value="">All statuses</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => update({ disputed: disputed ? '' : 'true' })}
          aria-pressed={disputed}
          className={`inline-flex h-10 items-center gap-2 rounded-md border px-3.5 text-[13px] font-medium transition ${
            disputed ? 'border-danger bg-danger-soft text-danger' : 'border-line bg-white text-ink hover:border-ink'
          }`}
        >
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          Disputed only
        </button>
      </div>

      {selected && (
        <div className="mb-6">
          <BookingDetail
            id={selected}
            onClose={() => update({ booking: '' })}
            onChanged={onChanged}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : state.error ? (
        <p className="text-clay">{state.error}</p>
      ) : state.bookings.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No service bookings match." className="rounded-lg border border-dashed border-line bg-white" />
      ) : (
        <div className={tableShell}>
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead>
              <tr className={tableHead}>
                <th className="px-5 py-3 font-medium">Booking</th>
                <th className="py-3 pr-4 font-medium">Provider</th>
                <th className="py-3 pr-4 font-medium">Customer</th>
                <th className="py-3 pr-4 font-medium">When</th>
                <th className="py-3 pr-4 font-medium">Price</th>
                <th className="py-3 pr-5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {state.bookings.map((b) => (
                <tr key={b._id} className={`${tableRow} cursor-pointer`} onClick={() => update({ booking: b._id })}>
                  <td className="px-5 py-3">
                    <button type="button" className="text-left" onClick={() => update({ booking: b._id })}>
                      <span className="font-medium text-ink hover:underline">{b.bookingNumber}</span>
                      <span className="mt-0.5 block text-[12px] text-muted">{b.offering.title}</span>
                    </button>
                  </td>
                  <td className="py-3 pr-4 text-ink">{b.provider?.displayName || '—'}</td>
                  <td className="py-3 pr-4 text-ink">
                    {b.customer?.name}
                    <span className="mt-0.5 block text-[12px] text-muted">{b.customer?.phone}</span>
                  </td>
                  <td className="py-3 pr-4 text-muted">{formatKarachiDateTime(bookingWhen(b))}</td>
                  <td className="py-3 pr-4 text-ink">{formatPrice(priceOf(b) / 100)}</td>
                  <td className="py-3 pr-5">
                    <StatusBadge value={b.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager pagination={state.pagination} onPage={(p) => update({ page: p > 1 ? String(p) : '' })} />
    </>
  )
}
