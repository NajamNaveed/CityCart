import { humanize } from '../../ui'
import { eventDetail, eventLabel } from '../../utils/serviceBookings'
import { formatKarachiDateTime } from '../../utils/serviceSlots'

/** The booking's event log, shared by the provider, customer and admin views. */
export default function BookingTimeline({ events = [] }) {
  if (events.length === 0) return <p className="text-[12.5px] text-ink/50">No activity yet.</p>
  return (
    <ol className="relative space-y-4 border-l border-line-warm pl-4">
      {events.map((event, index) => {
        const detail = eventDetail(event)
        return (
          <li key={`${event.type}-${index}`} className="relative">
            <span
              className="absolute -left-[21.5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper-warm bg-clay/70"
              aria-hidden="true"
            />
            <div className="min-w-0 text-[12.5px]">
              <p className="font-medium text-ink">{eventLabel(event)}</p>
              <p className="mt-0.5 text-[11.5px] text-ink/45">
                {formatKarachiDateTime(event.at)}
                {event.byRole ? ` · ${humanize(event.byRole)}` : ''}
              </p>
              {detail && <p className="mt-0.5 text-[12px] leading-relaxed text-ink/55">{detail}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
