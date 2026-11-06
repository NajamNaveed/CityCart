import { humanize } from '../../ui'
import { eventDetail, eventLabel } from '../../utils/serviceBookings'
import { formatKarachiDateTime } from '../../utils/serviceSlots'

/** The booking's event log, shared by the provider, customer and admin views. */
export default function BookingTimeline({ events = [] }) {
  if (events.length === 0) return <p className="text-[13px] text-muted">No activity yet.</p>
  return (
    <ol className="space-y-3">
      {events.map((event, index) => {
        const detail = eventDetail(event)
        return (
          <li key={`${event.type}-${index}`} className="flex gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-line" aria-hidden="true" />
            <div className="min-w-0 text-[13px]">
              <p className="font-medium text-ink">{eventLabel(event)}</p>
              <p className="text-[12px] text-muted">
                {formatKarachiDateTime(event.at)}
                {event.byRole ? ` · ${humanize(event.byRole)}` : ''}
              </p>
              {detail && <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{detail}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
