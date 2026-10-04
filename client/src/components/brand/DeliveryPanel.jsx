import { useState } from 'react'
import api, { getErrorMessage } from '../../services/api'
import { inputClass } from '../../ui'
import { Notice, StatusBadge } from './Bits'

// Mirrors the server's delivery transitions. It only decides which buttons to offer;
// the server re-checks every move. [target status, button label, kind]
const NEXT = {
  READY_FOR_PICKUP: [['PICKED_UP', 'Mark picked up', 'primary']],
  PICKED_UP: [
    ['OUT_FOR_DELIVERY', 'Out for delivery', 'primary'],
    ['IN_TRANSIT', 'Mark in transit', 'plain'],
  ],
  IN_TRANSIT: [['OUT_FOR_DELIVERY', 'Out for delivery', 'primary']],
  OUT_FOR_DELIVERY: [
    ['DELIVERED', 'Mark delivered', 'primary'],
    ['FAILED', 'Delivery failed', 'danger'],
  ],
  FAILED: [['OUT_FOR_DELIVERY', 'Try again: out for delivery', 'primary']],
}

const FINAL = ['DELIVERED', 'CANCELLED', 'RETURNED']

const primaryClass =
  'inline-flex h-10 items-center rounded-sm bg-pine px-5 text-[12px] font-medium uppercase tracking-[0.08em] text-cream hover:bg-[#162b22] disabled:opacity-50'
const labelClass = 'mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-muted'

export default function DeliveryPanel({ delivery, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })
  const [confirmDelivered, setConfirmDelivered] = useState(false)
  const [failing, setFailing] = useState(false)
  const [reason, setReason] = useState('')
  const [tracking, setTracking] = useState(delivery.trackingReference || '')
  const [agent, setAgent] = useState(delivery.assignedAgent || '')

  const actions = NEXT[delivery.status] || []
  const editable = !FINAL.includes(delivery.status)

  async function run(request, success) {
    setBusy(true)
    setMessage({ text: '', tone: 'ok' })
    try {
      await request()
      setConfirmDelivered(false)
      setFailing(false)
      setReason('')
      await onChanged()
      setMessage({ text: success, tone: 'ok' })
    } catch (err) {
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setBusy(false)
    }
  }

  const move = (status, failureReason) =>
    run(
      () => api.patch(`/deliveries/${delivery._id}/status`, { status, ...(failureReason && { failureReason }) }),
      status === 'DELIVERED' ? 'Marked as delivered. Cash payment recorded as received.' : 'Delivery updated.',
    )

  function onSave(e) {
    e.preventDefault()
    // The API cannot clear these once set, so only filled-in values are sent.
    const body = {
      ...(tracking.trim() && { trackingReference: tracking.trim() }),
      ...(agent.trim() && { assignedAgent: agent.trim() }),
    }
    if (Object.keys(body).length === 0) {
      setMessage({ text: 'Enter a tracking reference or a delivery agent first.', tone: 'warn' })
      return
    }
    run(() => api.patch(`/deliveries/${delivery._id}`, body), 'Delivery details saved.')
  }

  return (
    <section className="mb-10 border border-line bg-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Delivery</h2>
        <StatusBadge value={delivery.status} />
      </div>

      <div className="mt-4">
        <Notice tone={message.tone}>{message.text}</Notice>
      </div>

      {delivery.status === 'FAILED' && delivery.failureReason && (
        <p className="mb-4 border-l-2 border-clay bg-sand px-3 py-2 text-sm">Last attempt failed: {delivery.failureReason}</p>
      )}

      {actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {actions.map(([status, label, kind]) => {
            if (kind === 'danger') {
              return (
                <button key={status} type="button" disabled={busy} onClick={() => setFailing(true)} className="text-[13px] font-medium text-clay hover:underline">
                  {label}
                </button>
              )
            }
            if (status === 'DELIVERED') {
              return confirmDelivered ? (
                <span key={status} className="flex flex-wrap items-center gap-3 text-sm">
                  Cash collected and order delivered?
                  <button type="button" disabled={busy} onClick={() => move(status)} className="font-medium text-pine hover:underline">
                    Yes, delivered
                  </button>
                  <button type="button" onClick={() => setConfirmDelivered(false)} className="text-muted hover:underline">
                    Not yet
                  </button>
                </span>
              ) : (
                <button key={status} type="button" disabled={busy} onClick={() => setConfirmDelivered(true)} className={primaryClass}>
                  {label}
                </button>
              )
            }
            return kind === 'primary' ? (
              <button key={status} type="button" disabled={busy} onClick={() => move(status)} className={primaryClass}>
                {label}
              </button>
            ) : (
              <button key={status} type="button" disabled={busy} onClick={() => move(status)} className="text-[13px] font-medium text-pine hover:underline">
                {label}
              </button>
            )
          })}
        </div>
      )}

      {failing && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            move('FAILED', reason.trim())
          }}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 basis-64">
            <label htmlFor="failure-reason" className={labelClass}>
              What went wrong?
            </label>
            <input id="failure-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer not reachable" className={`h-10 ${inputClass}`} required autoFocus />
          </div>
          <button type="submit" disabled={busy || !reason.trim()} className="h-10 text-[13px] font-medium text-clay hover:underline">
            Record failed delivery
          </button>
          <button type="button" onClick={() => setFailing(false)} className="h-10 text-[13px] text-muted hover:underline">
            Cancel
          </button>
        </form>
      )}

      {delivery.status === 'DELIVERED' && <p className="text-sm text-muted">This order has been delivered. Nothing more to do.</p>}

      {editable ? (
        <form onSubmit={onSave} className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="tracking" className={labelClass}>
              Tracking reference
            </label>
            <input id="tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} className={`h-10 ${inputClass}`} />
          </div>
          <div>
            <label htmlFor="agent" className={labelClass}>
              Delivery agent
            </label>
            <input id="agent" value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="Name or number" className={`h-10 ${inputClass}`} />
          </div>
          <button type="submit" disabled={busy} className="h-10 text-[13px] font-medium text-pine hover:underline">
            Save details
          </button>
        </form>
      ) : (
        (delivery.trackingReference || delivery.assignedAgent) && (
          <dl className="mt-6 grid gap-2 border-t border-line pt-5 text-sm sm:grid-cols-2">
            {delivery.trackingReference && (
              <div>
                <dt className="text-muted">Tracking reference</dt>
                <dd>{delivery.trackingReference}</dd>
              </div>
            )}
            {delivery.assignedAgent && (
              <div>
                <dt className="text-muted">Delivery agent</dt>
                <dd>{delivery.assignedAgent}</dd>
              </div>
            )}
          </dl>
        )
      )}
    </section>
  )
}