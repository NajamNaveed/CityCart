import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import ProductImage from '../components/ProductImage'
import StatusPill from '../components/StatusPill'
import { EmptyState, ErrorState, PageHeader, Skeleton, btn, card, cardLift, fieldClass, shell } from '../design'
import { formatPrice, humanize } from '../ui'
import { BOOKING_STATUSES, bookingWhen, priceOf } from '../utils/serviceBookings'
import { formatKarachiDateTime } from '../utils/serviceSlots'

const statusNotes = {
  COMPLETED: 'Confirm the job',
  PROPOSED: 'Price ready',
}

export default function MyBookings() {
  const [params, setParams] = useSearchParams()
  const status = BOOKING_STATUSES.includes(params.get('status')) ? params.get('status') : ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [state, setState] = useState({ key: null, bookings: [], pagination: null, error: '' })
  const [reload, setReload] = useState(0)
  const key = JSON.stringify([status, page])

  useEffect(() => {
    let active = true
    api
      .get('/services/bookings', { params: { limit: 10, page, ...(status && { status }) } })
      .then((res) =>
        active && setState({ key, bookings: res.data.bookings, pagination: res.data.pagination, error: '' }),
      )
      .catch((err) => active && setState({ key, bookings: [], pagination: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [status, page, key, reload])

  function update(patch) {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...patch }).forEach(([name, value]) => (value ? next.set(name, value) : next.delete(name)))
    setParams(next)
  }

  const loading = state.key !== key
  const pagination = state.pagination

  return (
    <div className="bg-canvas">
      <div className={`${shell} max-w-[880px] pb-16 pt-10 sm:pt-14`}>
        <PageHeader
          eyebrow="Your account"
          title="My bookings"
          lede="Service appointments you requested. The provider replies with a price, then you confirm the finished job."
          actions={
            <Link to="/services" className={btn('noir', 'md')}>
              Book a service
            </Link>
          }
        />

        <div className="mt-8 flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-56">
            <label
              htmlFor="booking-status"
              className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink/45"
            >
              Status
            </label>
            <select
              id="booking-status"
              value={status}
              onChange={(e) => update({ status: e.target.value })}
              className={fieldClass({ shape: 'select', className: 'h-10' })}
            >
              <option value="">All bookings</option>
              {BOOKING_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {humanize(value)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`${card} flex items-center gap-4 p-4 sm:p-5`}>
                  <Skeleton className="size-14 shrink-0 rounded-tile" />
                  <div className="flex-1 space-y-2.5">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-2/5" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : state.error ? (
            <ErrorState message={state.error} onRetry={() => setReload((n) => n + 1)} />
          ) : state.bookings.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title={status ? 'No bookings with that status.' : 'You have not booked a service yet.'}
              message={
                status
                  ? 'Try another filter.'
                  : 'Browse services near you and request a time. You pay the provider at the door.'
              }
              action={
                <Link to="/services" className={btn('noir', 'md')}>
                  Browse services
                </Link>
              }
            />
          ) : (
            <ul className="space-y-3">
              {state.bookings.map((booking) => (
                <li key={booking._id}>
                  <Link
                    to={`/bookings/${booking._id}`}
                    className={`${card} ${cardLift} group flex flex-wrap items-center gap-4 p-4 sm:p-5`}
                  >
                    <ProductImage
                      src={booking.offering.image}
                      name={booking.offering.title}
                      className="size-14 shrink-0 rounded-tile text-sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="font-display text-[16px] font-semibold tracking-tight text-ink">
                          {booking.offering.title}
                        </span>
                        <StatusPill value={booking.status} />
                      </span>
                      <span className="mt-1 block text-[12px] text-ink/55">
                        {booking.provider?.displayName} · {booking.bookingNumber}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-ink/50">
                        {formatKarachiDateTime(bookingWhen(booking))}
                      </span>
                    </span>
                    <span className="w-full text-left sm:w-auto sm:text-right">
                      <span className="block font-display text-[16px] font-semibold text-ink">
                        {formatPrice(priceOf(booking) / 100)}
                      </span>
                      <span className="text-[11px] font-medium text-clay">{statusNotes[booking.status] || ''}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {pagination && pagination.pages > 1 && (
          <div className="mt-8 flex items-center justify-between gap-3 text-[12.5px]">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => update({ page: pagination.page - 1 > 1 ? String(pagination.page - 1) : '' })}
              className={btn('outline', 'sm')}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Previous
            </button>
            <span className="text-muted">
              Page {pagination.page} of {pagination.pages}
            </span>
            <button
              type="button"
              disabled={pagination.page >= pagination.pages}
              onClick={() => update({ page: String(pagination.page + 1) })}
              className={btn('outline', 'sm')}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
