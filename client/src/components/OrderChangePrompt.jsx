import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import StatusPill from './StatusPill'
import { btnOutline, btnPrimary, formatDateTime, formatPrice } from '../ui'

const lineText = (line) => {
  const supplied = `${line.supplyQuantity} of ${line.orderedQuantity} × ${line.productName}`
  return line.substitute
    ? `${supplied}, plus ${line.substitute.quantity} × ${line.substitute.productName} instead`
    : `${supplied} — the rest will be removed`
}

const DONE = {
  ACCEPT: 'Change accepted. Your order now has the items the brand can send.',
  REMOVE: 'Your order was updated to the items the brand can send.',
  CANCEL_ORDER: 'Your order was cancelled.',
}

export default function OrderChangePrompt({ order, adjustment, onChanged, onMessage }) {
  const [busy, setBusy] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [error, setError] = useState('')

  async function respond(action) {
    setBusy(action)
    setError('')
    try {
      const res = await api.post(`/orders/${order._id}/adjustments/${adjustment._id}/respond`, { action })
      const refund = res.data.refundAmount
      onMessage({
        text: refund ? `${DONE[action]} ${formatPrice(refund)} will be returned to your payment method.` : DONE[action],
        tone: 'ok',
      })
      setConfirmCancel(false)
      await onChanged()
    } catch (err) {
      setError(getErrorMessage(err))
      const code = err.response?.data?.code
      if (code === 'ADJUSTMENT_EXPIRED' || code === 'ADJUSTMENT_NOT_PENDING') await onChanged()
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-warning/40 bg-warning-soft/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink">The brand proposed a change</h2>
          <p className="mt-1 text-[13px] text-muted">
            Reply by {formatDateTime(adjustment.expiresAt)}. If you do nothing, your order stays as it is.
          </p>
        </div>
        <StatusPill value={adjustment.status} />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-ink/90">{adjustment.note}</p>

      <ul className="mt-3 space-y-1.5 text-sm text-ink/90">
        {adjustment.lines.map((line) => (
          <li key={String(line.orderItemId)}>• {lineText(line)}</li>
        ))}
      </ul>

      <dl className="mt-5 grid gap-3 rounded-md bg-white/70 p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[12px] text-muted">Order total now</dt>
          <dd className="mt-0.5 font-medium text-ink">{formatPrice(adjustment.totalsBefore.total)}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-muted">If you accept the change</dt>
          <dd className="mt-0.5 font-semibold text-ink">{formatPrice(adjustment.totalsAfter.total)}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-muted">If you keep only what they can send</dt>
          <dd className="mt-0.5 font-semibold text-ink">{formatPrice(adjustment.totalsAfterRemoval.total)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[12.5px] text-muted">
        Delivery and discounts stay the same.
        {order.paymentMethod === 'ONLINE_GATEWAY' &&
          order.paymentStatus === 'PAID' &&
          ' If the new total is lower, the difference goes back to your payment method.'}
      </p>

      {error && (
        <p className="mt-4 flex items-start gap-2 rounded-md bg-white px-3.5 py-2.5 text-sm text-clay">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <button type="button" disabled={Boolean(busy)} onClick={() => respond('ACCEPT')} className={btnPrimary}>
          {busy === 'ACCEPT' ? 'Accepting…' : 'Accept the change'}
        </button>
        <button type="button" disabled={Boolean(busy)} onClick={() => respond('REMOVE')} className={btnOutline}>
          {busy === 'REMOVE' ? 'Updating…' : 'Keep only what they can send'}
        </button>
        {confirmCancel ? (
          <span className="flex flex-wrap items-center gap-2.5 rounded-md bg-white px-3.5 py-2 text-sm">
            <span className="text-ink">Cancel the whole order?</span>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => respond('CANCEL_ORDER')}
              className="inline-flex h-9 items-center rounded-md bg-danger px-3.5 text-[12.5px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'CANCEL_ORDER' ? 'Cancelling…' : 'Yes, cancel it'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[12.5px] font-medium text-ink transition hover:border-ink"
            >
              Keep my order
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => setConfirmCancel(true)}
            className="inline-flex h-11 items-center rounded-md px-3 text-[13px] font-medium text-clay underline underline-offset-4 transition hover:text-clay-dark disabled:opacity-50"
          >
            Cancel the whole order
          </button>
        )}
      </div>
    </div>
  )
}
