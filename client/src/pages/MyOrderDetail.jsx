import { Fragment, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  BadgeCheck,
  Boxes,
  ChevronLeft,
  MapPin,
  PackageCheck,
  ReceiptText,
  TriangleAlert,
  Truck,
} from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import StatusPill from '../components/StatusPill'
import OrderItemReview from '../components/OrderItemReview'
import ProductImage from '../components/ProductImage'
import { Skeleton } from '../components/ui'
import { formatDateTime, formatPrice, wrap } from '../ui'

function SectionTitle({ children }) {
  return (
    <h2 className="border-b border-line pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
      {children}
    </h2>
  )
}

// The order's journey. An icon per step: gray while ahead, yellow while it is
// the step in progress, green once done — and the line through them fills the
// same way (a green→yellow gradient leads into the current step).
const STAGES = [
  { status: 'PENDING', label: 'Placed', icon: ReceiptText },
  { status: 'CONFIRMED', label: 'Confirmed', icon: BadgeCheck },
  { status: 'PROCESSING', label: 'Processing', icon: Boxes, aliases: ['READY_FOR_SHIPMENT'] },
  { status: 'SHIPPED', label: 'Shipped', icon: Truck },
  { status: 'OUT_FOR_DELIVERY', label: 'Out for delivery', icon: MapPin },
  { status: 'DELIVERED', label: 'Delivered', icon: PackageCheck },
]

const STAGE_INDEX = { PENDING: 0, CONFIRMED: 1, PROCESSING: 2, READY_FOR_SHIPMENT: 2, SHIPPED: 3, OUT_FOR_DELIVERY: 4, DELIVERED: 5 }

const TERMINAL_PROBLEMS = {
  CANCELLED: 'This order was cancelled. Any reserved stock has been returned.',
  REJECTED: 'The brand could not fulfil this order. You were not charged.',
}

function ProgressStepper({ history, orderStatus }) {
  const reachedFromHistory = Math.max(-1, ...(history || []).map((h) => STAGE_INDEX[h.status] ?? -1))
  const current = Math.max(reachedFromHistory, STAGE_INDEX[orderStatus] ?? 0)

  const timeFor = (stageIdx) => {
    const entry = (history || []).find((h) => STAGE_INDEX[h.status] === stageIdx)
    return entry ? formatDateTime(entry.at) : null
  }

  return (
    <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ol className="flex min-w-[560px] items-start sm:min-w-0">
        {STAGES.map((stage, i) => {
          const Icon = stage.icon
          const done = i < current
          const isCurrent = i === current
          const time = timeFor(i)
          // The segment leading into stage i: fully green for done steps, a
          // green→yellow gradient into the current one, gray ahead of it.
          const segmentTone =
            i === 0
              ? null
              : i < current
                ? 'bg-success'
                : i === current
                  ? 'bg-gradient-to-r from-success to-warning'
                  : 'bg-line'
          return (
            <Fragment key={stage.status}>
              {i > 0 && <li aria-hidden="true" className={`mx-1 mt-[17px] h-0.5 flex-1 rounded-full ${segmentTone}`} />}
              <li className={`flex min-w-[72px] flex-col items-center gap-1.5 text-center ${i > 0 ? '' : ''}`}>
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors ${
                    done
                      ? 'border-success bg-success text-white'
                      : isCurrent
                        ? 'border-warning bg-warning-soft text-warning'
                        : 'border-line bg-white text-muted/60'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className={`text-[10.5px] font-medium leading-tight sm:text-[11.5px] ${done || isCurrent ? 'text-ink' : 'text-muted/70'}`}>
                  {stage.label}
                </span>
                {time && <span className="hidden text-[10px] text-muted/70 sm:block">{time}</span>}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </div>
  )
}

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

  if (state.id !== id)
    return (
      <div className={`${wrap} max-w-4xl space-y-4 py-10`}>
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )

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
  const problem = TERMINAL_PROBLEMS[order.orderStatus]

  return (
    <div className={`${wrap} max-w-4xl py-10`}>
      <Link to="/orders" className="inline-flex items-center gap-1 text-[13px] text-muted transition hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        My orders
      </Link>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{order.orderNumber}</h1>
        <p className="text-sm text-muted">Placed {formatDateTime(order.createdAt)}</p>
      </div>

      {notice.text && (
        <p
          role="status"
          className={`mt-5 rounded-md px-3.5 py-2.5 text-sm ${
            notice.tone === 'ok' ? 'bg-success-soft text-success' : 'bg-clay/5 text-clay'
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-3 text-sm">
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

      {/* Order progress — full width, above everything else */}
      <div className="mt-6 rounded-lg border border-line bg-white p-5 sm:p-6">
        {problem ? (
          <p className="flex items-center gap-2.5 text-sm text-clay">
            <TriangleAlert className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
            {problem}
          </p>
        ) : (
          <ProgressStepper history={order.statusHistory} orderStatus={order.orderStatus} />
        )}
      </div>

      <div className="mt-9 grid gap-10 lg:grid-cols-[1fr_17rem]">
        <section>
          <SectionTitle>Items</SectionTitle>
          <ul className="divide-y divide-line">
            {order.items.map((item) => (
              <li key={`${item.productId}-${item.sku || ''}`} className="py-4 text-sm">
                <div className="flex items-start gap-4">
                  <Link
                    to={`/product/${item.productId}`}
                    className="block w-14 shrink-0 overflow-hidden rounded-md bg-sand"
                  >
                    <ProductImage src={item.image} name={item.productName} className="aspect-square w-full" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-wrap justify-between gap-x-4 gap-y-1">
                    <span>
                      <Link to={`/product/${item.productId}`} className="font-medium text-ink transition hover:text-clay">
                        {item.productName}
                      </Link>
                      <span className="block text-muted">
                        {item.quantity} × {formatPrice(item.unitPrice)}
                      </span>
                    </span>
                    <span className="font-semibold text-ink">{formatPrice(item.totalPrice)}</span>
                  </div>
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
              <dd className="text-ink">{formatPrice(order.subtotal)}</dd>
            </div>
            {order.deliveryFee > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">Delivery</dt>
                <dd className="text-ink">{formatPrice(order.deliveryFee)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <dt className="text-ink">Total (cash on delivery)</dt>
              <dd className="text-ink">{formatPrice(order.total)}</dd>
            </div>
          </dl>

          {order.orderStatus === 'PENDING' && (
            <div className="mt-8 rounded-lg border border-warning/30 bg-warning-soft p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-[13.5px] font-semibold text-ink">Changed your mind?</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                    You can cancel until the brand confirms your order. Reserved stock returns automatically.
                  </p>
                  {confirming ? (
                    <div className="mt-3 flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        onClick={cancel}
                        disabled={busy}
                        className="inline-flex h-9 items-center rounded-md bg-danger px-4 text-[12.5px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                      >
                        {busy ? 'Cancelling…' : 'Yes, cancel this order'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(false)}
                        className="inline-flex h-9 items-center rounded-md border border-line bg-white px-4 text-[12.5px] font-medium text-ink transition hover:border-ink"
                      >
                        Keep it
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      className="mt-3 inline-flex h-9 items-center rounded-md border border-danger/40 bg-white px-4 text-[12.5px] font-medium text-danger transition hover:border-danger"
                    >
                      Cancel order
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-9 text-sm">
          <section>
            <SectionTitle>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                Delivering to
              </span>
            </SectionTitle>
            <address className="mt-3.5 not-italic leading-relaxed text-ink/90">
              <span className="font-medium text-ink">{a.name}</span>
              <br />
              {a.address}
              <br />
              {[a.city, a.state, a.postalCode].filter(Boolean).join(', ')}
              <br />
              {a.phone}
              {a.additionalInstructions && (
                <span className="mt-2 block text-muted">Note: {a.additionalInstructions}</span>
              )}
            </address>
          </section>

          {delivery && (delivery.trackingReference || delivery.assignedAgent || delivery.status === 'FAILED') && (
            <section>
              <SectionTitle>
                <span className="inline-flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                  Delivery
                </span>
              </SectionTitle>
              <dl className="mt-3.5 space-y-2.5">
                {delivery.trackingReference && (
                  <div>
                    <dt className="text-muted">Tracking reference</dt>
                    <dd className="font-medium text-ink">{delivery.trackingReference}</dd>
                  </div>
                )}
                {delivery.assignedAgent && (
                  <div>
                    <dt className="text-muted">Delivered by</dt>
                    <dd className="font-medium text-ink">{delivery.assignedAgent}</dd>
                  </div>
                )}
              </dl>
              {delivery.status === 'FAILED' && (
                <p className="mt-3 rounded-md bg-clay/5 px-3.5 py-2.5 text-[13px] text-clay">
                  The last delivery attempt did not go through. The brand will try again.
                </p>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
