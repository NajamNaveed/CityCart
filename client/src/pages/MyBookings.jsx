import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import ProductImage from '../components/ProductImage'
import { StatusBadge, selectClass } from '../components/brand/Bits'
import { EmptyState, Skeleton } from '../components/ui'
import { formatPrice, humanize, wrap } from '../ui'
import { BOOKING_STATUSES, bookingWhen, priceOf } from '../utils/serviceBookings'
import { formatKarachiDateTime } from '../utils/serviceSlots'

export default function MyBookings() {
  const [params, setParams] = useSearchParams()
  const status = BOOKING_STATUSES.includes(params.get('status')) ? params.get('status') : ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [state, setState] = useState({ key: null, bookings: [], pagination: null, error: '' })
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
  }, [status, page, key])

  function update(patch) {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...patch }).forEach(([name, value]) => (value ? next.set(name, value) : next.delete(name)))
    setParams(next)
  }

  const loading = state.key !== key
  const pagination = state.pagination

  return (
    <div className={`${wrap} max-w-4xl py-10`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Your account</p>
      <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">My bookings</h1>
      <p className="mt-2 max-w-xl text-[13.5px] text-muted">
        Service appointments you requested. The provider replies with a price, then you confirm the finished job.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <label htmlFor="booking-status" className="sr-only">
          Status
        </label>
        <select
          id="booking-status"
          value={status}
          onChange={(e) => update({ status: e.target.value })}
          className={selectClass}
        >
          <option value="">All bookings</option>
          {BOOKING_STATUSES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : state.error ? (
          <p className="text-clay">{state.error}</p>
        ) : state.bookings.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title={status ? 'No bookings with that status.' : 'You have not booked a service yet.'}
            message={
              status
                ? 'Try another filter.'
                : 'Browse services near you and request a time. You pay the provider at the door.'
            }
            className="py-20"
            action={
              <Link
                to="/services"
                className="inline-flex h-11 items-center justify-center rounded-md bg-ink px-6 text-[13px] font-medium uppercase tracking-[0.08em] text-white transition hover:bg-ink-soft"
              >
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
                  className="group flex flex-wrap items-center gap-4 rounded-lg border border-line bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink/5 sm:p-5"
                >
                  <ProductImage
                    src={booking.offering.image}
                    name={booking.offering.title}
                    className="size-14 shrink-0 rounded-md text-sm"
                  />
                  <span className="min-w-0 flex-1 basis-52">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium text-ink">{booking.offering.title}</span>
                      <StatusBadge value={booking.status} />
                    </span>
                    <span className="mt-1 block text-[13px] text-muted">
                      {booking.provider?.displayName} · {booking.bookingNumber}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-muted/80">
                      {formatKarachiDateTime(bookingWhen(booking))}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold text-ink">{formatPrice(priceOf(booking) / 100)}</span>
                    <span className="text-[11.5px] text-muted">
                      {booking.status === 'COMPLETED' ? 'Confirm the job' : booking.status === 'PROPOSED' ? 'Price ready' : ''}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pagination && pagination.pages > 1 && (
        <div className="mt-8 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => update({ page: pagination.page - 1 > 1 ? String(pagination.page - 1) : '' })}
            className="inline-flex items-center gap-1 font-medium text-clay transition hover:text-clay-dark disabled:text-muted"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Previous
          </button>
          <span className="text-muted">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            type="button"
            disabled={pagination.page >= pagination.pages}
            onClick={() => update({ page: String(pagination.page + 1) })}
            className="inline-flex items-center gap-1 font-medium text-clay transition hover:text-clay-dark disabled:text-muted"
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
