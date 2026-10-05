import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api, { getErrorMessage } from '../services/api'
import StatusPill from '../components/StatusPill'
import OrderItemReview from '../components/OrderItemReview'
import { formatDateTime, formatPrice, humanize, wrap } from '../ui'

export default function MyOrderDetail() {
  const { id } = useParams()
  const [state, setState] = useState({ id: null, order: null, payment: null, delivery: null, error: '' })
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState({ text: '', tone: 'ok' })
  const [myReviews, setMyReviews] = useState([])

  useEffect(() => {
    let active = true
    api
      .get(`/orders/${id}`)
      .then((res) => active && setState({ id, order: res.data.order, payment: res.data.payment, delivery: res.data.delivery, error: '' }))
      .catch((err) => active && setState({ id, order: null, payment: null, delivery: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [id])

  // Once the order is delivered, load the customer's own reviews of its items.
  const delivered = state.order?.orderStatus === 'DELIVERED'
  useEffect(() => {
    if (!delivered) return undefined
    let active = true
    api
      .get('/reviews/mine', { params: { orderId: id } })
      .then((res) => active && setMyReviews(res.data.reviews))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [delivered, id])

  const reviewOf = (productId) => myReviews.find((r) => String(r.productId) === String(productId))
  const saveReview = (review) => setMyReviews((list) => [review, ...list.filter((r) => r._id !== review._id)])
  const dropReview = (reviewId) => setMyReviews((list) => list.filter((r) => r._id !== reviewId))

  async function cancel() {
    setBusy(true)
    setNotice({ text: '', tone: 'ok' })
    try {
      const res = await api.patch(`/orders/${id}/cancel`)
      setState((s) => ({ ...s, order: res.data.order }))
      setNotice({ text: 'Your order has been cancelled.', tone: 'ok' })
    } catch (err) {
      setNotice({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  if (state.id !== id) return <div className={`${wrap} py-10`}><div className="h-64 animate-pulse bg-sand" /></div>
  if (!state.order) {
    return (
      <div className={`${wrap} py-16`}>
        <p className="text-lg font-medium">{state.error}</p>
        <Link to="/orders" className="mt-4 inline-block text-clay underline underline-offset-4">
          Back to my orders
        </Link>
      </div>
    )
  }

  const { order, payment, delivery } = state
  const a = order.shippingAddress || {}

  return (
    <div className={`${wrap} max-w-4xl py-10`}>
      <p className="text-[13px] text-muted">
        <Link to="/orders" className="hover:text-clay">
          My orders
        </Link>
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{order.orderNumber}</h1>
      <p className="mt-1 text-sm text-muted">Placed {formatDateTime(order.createdAt)}</p>

      {notice.text && (
        <p role="status" className={`mt-6 border-l-2 px-3 py-2 text-sm ${notice.tone === 'ok' ? 'border-ink bg-sand' : 'border-clay bg-sand'}`}>
          {notice.text}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
        <span className="flex items-center gap-2">
          <span className="text-muted">Order</span>
          <StatusPill value={order.orderStatus} />
        </span>
        <span className="flex items-center gap-2">
          <span className="text-muted">Payment</span>
          <StatusPill value={payment?.status || order.paymentStatus} />
        </span>
        {delivery && (
          <span className="flex items-center gap-2">
            <span className="text-muted">Delivery</span>
            <StatusPill value={delivery.status} />
          </span>
        )}
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_16rem]">
        <section>
          <h2 className="border-b border-ink pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Items</h2>
          <ul className="divide-y divide-line">
            {order.items.map((item) => (
              <li key={`${item.productId}-${item.sku || ''}`} className="py-4 text-sm">
                <div className="flex justify-between gap-4">
                  <span>
                    <Link to={`/product/${item.productId}`} className="font-medium hover:text-clay">
                      {item.productName}
                    </Link>
                    <span className="block text-muted">
                      {item.quantity} × {formatPrice(item.unitPrice)}
                    </span>
                  </span>
                  <span className="font-semibold">{formatPrice(item.totalPrice)}</span>
                </div>
                {delivered && (
                  <OrderItemReview
                    key={reviewOf(item.productId)?._id || 'new'}
                    orderId={order._id}
                    item={item}
                    review={reviewOf(item.productId)}
                    onSaved={saveReview}
                    onDeleted={dropReview}
                  />
                )}
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

          {order.orderStatus === 'PENDING' && (
            <div className="mt-8 text-sm">
              {confirming ? (
                <span className="flex flex-wrap items-center gap-3">
                  Cancel this order?
                  <button type="button" onClick={cancel} disabled={busy} className="font-medium text-clay hover:underline">
                    Yes, cancel it
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className="text-muted hover:underline">
                    Keep it
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirming(true)} className="font-medium text-clay hover:underline">
                  Cancel order
                </button>
              )}
              <p className="mt-2 text-xs text-muted">You can cancel until the brand confirms your order.</p>
            </div>
          )}
        </section>

        <aside className="space-y-10 text-sm">
          <section>
            <h2 className="border-b border-ink pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Delivering to</h2>
            <address className="mt-3 not-italic leading-relaxed">
              <span className="font-medium">{a.name}</span>
              <br />
              {a.address}
              <br />
              {[a.city, a.state, a.postalCode].filter(Boolean).join(', ')}
              <br />
              {a.phone}
              {a.additionalInstructions && <span className="mt-2 block text-muted">Note: {a.additionalInstructions}</span>}
            </address>
          </section>

          {delivery && (delivery.trackingReference || delivery.assignedAgent || delivery.status === 'FAILED') && (
            <section>
              <h2 className="border-b border-ink pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Delivery</h2>
              <dl className="mt-3 space-y-2">
                {delivery.trackingReference && (
                  <div>
                    <dt className="text-muted">Tracking reference</dt>
                    <dd className="font-medium">{delivery.trackingReference}</dd>
                  </div>
                )}
                {delivery.assignedAgent && (
                  <div>
                    <dt className="text-muted">Delivered by</dt>
                    <dd className="font-medium">{delivery.assignedAgent}</dd>
                  </div>
                )}
              </dl>
              {delivery.status === 'FAILED' && (
                <p className="mt-3 text-clay">The last delivery attempt did not go through. The brand will try again.</p>
              )}
            </section>
          )}

          {order.statusHistory?.length > 0 && (
            <section>
              <h2 className="border-b border-ink pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Progress</h2>
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
    </div>
  )
}