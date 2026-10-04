import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api, { getErrorMessage } from '../../services/api'
import { Notice, PageHeader, StatusBadge } from '../../components/brand/Bits'
import DeliveryPanel from '../../components/brand/DeliveryPanel'
import { formatDateTime, formatPrice, humanize } from '../../ui'

// What a brand may do next. The server re-checks every move, so this only decides which buttons to offer.
// From "ready for shipment" onwards the delivery panel takes over.
const ACTIONS = {
  PENDING: [['CONFIRMED', 'Confirm order', true], ['REJECTED', 'Reject', false]],
  CONFIRMED: [['PROCESSING', 'Start processing', true], ['REJECTED', 'Reject', false]],
  PROCESSING: [['READY_FOR_SHIPMENT', 'Mark ready for shipment', true]],
}

export default function OrderDetail() {
  const { id } = useParams()
  const [state, setState] = useState({ id: null, order: null, payment: null, delivery: null, error: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })
  const [confirmReject, setConfirmReject] = useState(false)

  const fetchOrder = useCallback(
    () =>
      api.get(`/brand/orders/${id}`).then(
        (res) => ({ id, order: res.data.order, payment: res.data.payment, delivery: res.data.delivery, error: '' }),
        (err) => ({ id, order: null, payment: null, delivery: null, error: getErrorMessage(err) }),
      ),
    [id],
  )

  useEffect(() => {
    let active = true
    fetchOrder().then((next) => active && setState(next))
    return () => {
      active = false
    }
  }, [fetchOrder])

  async function move(status) {
    setBusy(true)
    setMessage({ text: '', tone: 'ok' })
    setConfirmReject(false)
    try {
      await api.patch(`/brand/orders/${id}/status`, { status })
      setMessage({ text: `Order marked as ${humanize(status).toLowerCase()}.`, tone: 'ok' })
      setState(await fetchOrder())
    } catch (err) {
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setBusy(false)
    }
  }

  if (state.id !== id) return <div className="h-64 animate-pulse bg-sand" />
  if (!state.order) {
    return (
      <>
        <p className="text-clay">{state.error}</p>
        <Link to="/brand/orders" className="mt-4 inline-block text-sm font-medium text-pine hover:underline">
          Back to orders
        </Link>
      </>
    )
  }

  const { order, payment, delivery } = state
  const actions = ACTIONS[order.orderStatus] || []
  const a = order.shippingAddress || {}

  return (
    <>
      <PageHeader
        title={order.orderNumber}
        intro={`Placed ${formatDateTime(order.createdAt)}`}
        action={
          <Link to="/brand/orders" className="text-[13px] font-medium text-pine hover:underline">
            Back to orders
          </Link>
        }
      />
      <Notice tone={message.tone}>{message.text}</Notice>

      <div className="mb-8 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
        <span className="flex items-center gap-2">
          <span className="text-muted">Order</span>
          <StatusBadge value={order.orderStatus} />
        </span>
        <span className="flex items-center gap-2">
          <span className="text-muted">Payment</span>
          <StatusBadge value={payment?.status || order.paymentStatus} />
        </span>
        {delivery && (
          <span className="flex items-center gap-2">
            <span className="text-muted">Delivery</span>
            <StatusBadge value={delivery.status} />
          </span>
        )}
      </div>

      {actions.length > 0 && (
        <div className="mb-10 flex flex-wrap items-center gap-3 border border-line bg-paper p-5">
          {actions.map(([status, label, primary]) =>
            primary ? (
              <button key={status} type="button" disabled={busy} onClick={() => move(status)} className="inline-flex h-10 items-center rounded-sm bg-pine px-5 text-[12px] font-medium uppercase tracking-[0.08em] text-cream hover:bg-[#162b22] disabled:opacity-50">
                {label}
              </button>
            ) : confirmReject ? (
              <span key={status} className="flex items-center gap-3 text-sm">
                Reject and return the stock?
                <button type="button" disabled={busy} onClick={() => move(status)} className="font-medium text-clay hover:underline">
                  Yes, reject
                </button>
                <button type="button" onClick={() => setConfirmReject(false)} className="text-muted hover:underline">
                  Cancel
                </button>
              </span>
            ) : (
              <button key={status} type="button" disabled={busy} onClick={() => setConfirmReject(true)} className="text-[13px] font-medium text-clay hover:underline">
                {label}
              </button>
            ),
          )}
        </div>
      )}

      {delivery && <DeliveryPanel key={delivery._id} delivery={delivery} onChanged={async () => setState(await fetchOrder())} />}
        
      <div className="grid gap-12 lg:grid-cols-[1fr_17rem]">
        <section>
          <h2 className="border-b border-ink pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Items</h2>
          <ul className="divide-y divide-line">
            {order.items.map((item) => (
              <li key={`${item.productId}-${item.sku || ''}`} className="flex justify-between gap-4 py-4 text-sm">
                <span>
                  <span className="font-medium">{item.productName}</span>
                  <span className="block text-muted">
                    {item.quantity} × {formatPrice(item.unitPrice)}
                  </span>
                </span>
                <span className="font-semibold">{formatPrice(item.totalPrice)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-2 space-y-2 border-t border-ink pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd>{formatPrice(order.subtotal)}</dd>
            </div>
            {order.deliveryFee > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">Delivery</dt>
                <dd>{formatPrice(order.deliveryFee)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <dt>Total (cash on delivery)</dt>
              <dd>{formatPrice(order.total)}</dd>
            </div>
          </dl>
        </section>

        <aside className="space-y-10 text-sm">
          <section>
            <h2 className="border-b border-ink pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Deliver to</h2>
            <address className="mt-3 not-italic leading-relaxed">
              <span className="font-medium">{a.name}</span>
              <br />
              {a.address}
              <br />
              {[a.city, a.state, a.postalCode].filter(Boolean).join(', ')}
              <br />
              <a href={`tel:${a.phone}`} className="text-pine hover:underline">
                {a.phone}
              </a>
              {a.additionalInstructions && <span className="mt-2 block text-muted">Note: {a.additionalInstructions}</span>}
            </address>
          </section>

          {order.statusHistory?.length > 0 && (
            <section>
              <h2 className="border-b border-ink pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">History</h2>
              <ol className="mt-3 space-y-2">
                {[...order.statusHistory].reverse().map((h) => (
                  <li key={h._id || `${h.status}-${h.at}`} className="flex justify-between gap-3">
                    <span>{humanize(h.status)}</span>
                    <span className="text-muted">{formatDateTime(h.at)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>
    </>
  )
}