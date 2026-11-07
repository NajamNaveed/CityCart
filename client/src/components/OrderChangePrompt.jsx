import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import StatusPill from './StatusPill'
import { formatDateTime, formatPrice } from '../ui'
import { btn, display } from '../design'

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

const dangerBtn =
  'inline-flex h-9 items-center justify-center rounded-tile bg-danger px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-white transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-50'

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
    <div className="mt-6 rounded-panel border border-clay/25 bg-cream/70 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={display.sm}>The brand proposed a change</h2>
          <p className="mt-1.5 text-[12.5px] text-ink/55">
            Reply by {formatDateTime(adjustment.expiresAt)}. If you do nothing, your order stays as it is.
          </p>
        </div>
        <StatusPill value={adjustment.status} />
      </div>

      {adjustment.proposedByRole === 'PICKER' && (
        <p className="mt-3 inline-flex rounded-full bg-paper-warm px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/60">
          Suggested by the store’s picker
        </p>
      )}

      <p className="mt-4 text-[13.5px] leading-relaxed text-ink/80">{adjustment.note}</p>

      <ul className="mt-3 space-y-1.5 text-[13.5px] text-ink/80">
        {adjustment.lines.map((line) => (
          <li key={String(line.orderItemId)} className="flex gap-2">
            <span className="text-clay" aria-hidden="true">•</span>
            {lineText(line)}
          </li>
        ))}
      </ul>

      <dl className="mt-5 grid gap-3 rounded-tile border border-line-warm bg-paper-warm/80 p-4 text-[13px] sm:grid-cols-3">
        <div>
          <dt className="text-[11.5px] text-ink/55">Order total now</dt>
          <dd className="mt-0.5 font-medium text-ink">{formatPrice(adjustment.totalsBefore.total)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-ink/55">If you accept the change</dt>
          <dd className="mt-0.5 font-semibold text-ink">{formatPrice(adjustment.totalsAfter.total)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-ink/55">If you keep only what they can send</dt>
          <dd className="mt-0.5 font-semibold text-ink">{formatPrice(adjustment.totalsAfterRemoval.total)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[11.5px] text-ink/55">Delivery and discounts stay the same.</p>

      {error && (
        <p className="mt-4 flex items-start gap-2 rounded-tile bg-paper-warm px-3.5 py-2.5 text-[12.5px] text-clay">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <button type="button" disabled={Boolean(busy)} onClick={() => respond('ACCEPT')} className={btn('primary', 'md')}>
          {busy === 'ACCEPT' ? 'Accepting…' : 'Accept the change'}
        </button>
        <button type="button" disabled={Boolean(busy)} onClick={() => respond('REMOVE')} className={btn('outline', 'md')}>
          {busy === 'REMOVE' ? 'Updating…' : 'Keep only what they can send'}
        </button>
        {confirmCancel ? (
          <span className="flex flex-wrap items-center gap-2.5 rounded-tile border border-line-warm bg-paper-warm px-3.5 py-2 text-[12.5px]">
            <span className="text-ink">Cancel the whole order?</span>
            <button type="button" disabled={Boolean(busy)} onClick={() => respond('CANCEL_ORDER')} className={dangerBtn}>
              {busy === 'CANCEL_ORDER' ? 'Cancelling…' : 'Yes, cancel it'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className="inline-flex h-9 items-center rounded-tile border border-line-warm bg-transparent px-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink transition hover:border-ink/40"
            >
              Keep my order
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => setConfirmCancel(true)}
            className="inline-flex h-11 items-center rounded-tile px-2 text-[12px] font-medium text-clay underline underline-offset-4 transition hover:text-clay-dark disabled:opacity-50"
          >
            Cancel the whole order
          </button>
        )}
      </div>
    </div>
  )
}
