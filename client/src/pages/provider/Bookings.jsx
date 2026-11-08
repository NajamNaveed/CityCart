import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarClock, MessageCircle } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { PageHeader, Pager, StatusBadge, selectClass } from '../../components/brand/Bits'
import { EmptyState, Skeleton } from '../../components/ui'
import { formatPrice, humanize } from '../../ui'
import { BOOKING_STATUSES, priceOf } from '../../utils/serviceBookings'
import { formatKarachiDateTime } from '../../utils/serviceSlots'

export default function ProviderBookings() {
  const [params, setParams] = useSearchParams()
  const status = BOOKING_STATUSES.includes(params.get('status')) ? params.get('status') : ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [state, setState] = useState({ key: null, bookings: [], pagination: null, error: '' })
  const key = JSON.stringify([status, page])

  useEffect(() => {
    let active = true
    api
      .get('/services/provider/bookings', {
        params: { limit: 12, page, ...(status && { status }) },
      })
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

  return (
    <>
      <PageHeader
        title="Bookings"
        intro="Requests and jobs from your customers. Accept a request, send a price, or continue a confirmed job."
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <select id="status" value={status} onChange={(e) => update({ status: e.target.value })} className={selectClass}>
          <option value="">All bookings</option>
          {BOOKING_STATUSES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-card" />
          ))}
        </div>
      ) : state.error ? (
        <p role="alert" className="rounded-tile border border-clay/20 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">{state.error}</p>
      ) : state.bookings.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={status ? 'No bookings with that status.' : 'No bookings yet.'}
          message={
            status
              ? 'Try another filter.'
              : 'When a customer requests a time from your public page, it appears here.'
          }
          className="rounded-card border border-dashed border-line-warm bg-paper-warm"
        />
      ) : (
        <ul className="space-y-3">
          {state.bookings.map((booking) => (
            <li key={booking._id}>
              <Link
                to={`/provider/bookings/${booking._id}`}
                className="group flex flex-wrap items-center gap-x-5 gap-y-3 rounded-card border border-line-warm bg-paper-warm p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-noir/5"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium text-ink">{booking.bookingNumber}</span>
                    <StatusBadge value={booking.status} />
                    {booking.unread > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-tile bg-clay/8 px-2 py-0.5 text-[11px] font-medium text-clay">
                        <MessageCircle className="h-3 w-3" aria-hidden="true" />
                        {booking.unread} new
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-[13px] text-ink/55">
                    {booking.customer?.name} · {booking.offering.title}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-ink/55">
                    {formatKarachiDateTime(booking.scheduledStart || booking.requestedStart)}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold text-ink">{formatPrice(priceOf(booking) / 100)}</span>
                  <span className="text-[11.5px] text-ink/55">
                    {booking.status === 'REQUESTED'
                      ? 'Starting price'
                      : booking.status === 'PROPOSED'
                        ? 'Proposed'
                        : booking.status === 'COMPLETED'
                          ? 'Waiting for customer'
                          : booking.status === 'CONFIRMED'
                            ? 'Confirmed'
                            : 'Agreed price'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Pager pagination={state.pagination} onPage={(value) => update({ page: value > 1 ? String(value) : '' })} />
    </>
  )
}
