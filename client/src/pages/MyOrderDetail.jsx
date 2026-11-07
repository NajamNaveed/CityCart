import { Fragment, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  BadgeCheck,
  Boxes,
  ChevronLeft,
  MapPin,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  TriangleAlert,
  Truck,
} from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import StatusPill from '../components/StatusPill'
import OrderItemReview from '../components/OrderItemReview'
import OrderChangePrompt from '../components/OrderChangePrompt'
import ProductImage from '../components/ProductImage'
import DeliveryMap from '../components/DeliveryMap'
import { ErrorState, Skeleton, btn, display, panel, shell } from '../design'
import { formatDateTime, formatPrice } from '../ui'
import { latLngOfGeoPoint } from '../utils/geo'
import { reasonLabel } from '../utils/returns'

// While the order is on its way, the customer reads this code to the rider; the
// rider cannot mark the order delivered without it (docs/11, docs/20 §7).
const ON_THE_ROAD = ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED']

function DeliveryCode({ deliveryId }) {
  const [code, setCode] = useState('')
  useEffect(() => {
    let active = true
    api
      .get(`/deliveries/${deliveryId}/code`)
      .then((res) => active && setCode(res.data.code))
      .catch(() => active && setCode(''))
    return () => {
      active = false
    }
  }, [deliveryId])

  if (!code) return null
  return (
    <div className="mt-3.5 rounded-tile border border-line-warm bg-paper-warm p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink/45">Your delivery code</p>
      <p className="mt-1 font-display text-3xl tracking-[0.3em] text-ink" aria-label={`Delivery code ${code.split('').join(' ')}`}>
        {code}
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-ink/50">
        Give this code to the rider when your order arrives. Please do not share it before.
      </p>
    </div>
  )
}

// The receipt of a paid order; nothing is shown until one exists.
const PAID_BY = { CASH: 'cash', CARD: 'card machine', BANK_TRANSFER: 'bank transfer', WALLET: 'wallet' }
const WALLETS = { JAZZCASH: 'JazzCash', EASYPAISA: 'Easypaisa', OTHER: 'other wallet' }
// How a COD order was paid at the door (docs/21 §I.5); absent on older receipts.
function paidBy(receipt) {
  if (!receipt.collectionMethod) return ''
  const name = PAID_BY[receipt.collectionMethod] || receipt.collectionMethod.toLowerCase().replaceAll('_', ' ')
  return receipt.collectionMethod === 'WALLET' && receipt.collectionWallet
    ? `${name} (${WALLETS[receipt.collectionWallet] || receipt.collectionWallet})`
    : name
}

function ReceiptNote({ orderId }) {
  const [receipt, setReceipt] = useState(null)
  useEffect(() => {
    let active = true
    api
      .get(`/receipts/order/${orderId}`)
      .then((res) => active && setReceipt(res.data.receipt))
      .catch(() => active && setReceipt(null))
    return () => {
      active = false
    }
  }, [orderId])

  if (!receipt) return null
  const by = paidBy(receipt)
  return (
    <p className="mt-2 text-[11.5px] text-ink/55">
      Receipt {receipt.receiptNumber}{by ? `, paid by ${by}` : ''}, issued {formatDateTime(receipt.issuedAt)}.
    </p>
  )
}

// Where the rider is, if they chose to share it while delivering. Nothing is shown (and nothing is
// claimed) when they are not sharing. The position is polled while the tab is visible; a missed
// refresh keeps the last dot on screen instead of blanking the map (docs/11 §30).
const RIDER_POLL_MS = 15000

function RiderLocation({ deliveryId, destination }) {
  const [state, setState] = useState({ location: null, minutes: 0, error: '', everShown: false })
  useEffect(() => {
    let active = true
    let timer

    const ask = async () => {
      clearTimeout(timer)
      try {
        const res = await api.get(`/deliveries/${deliveryId}/rider-location`)
        if (!active) return
        const location = res.data.location || null
        // The server already hides a position older than ten minutes, so the age is a calm "x min ago".
        const minutes = location
          ? Math.max(0, Math.round((Date.now() - new Date(location.recordedAt).getTime()) / 60000))
          : 0
        setState((now) => ({ location, minutes, error: '', everShown: now.everShown || Boolean(location) }))
      } catch {
        if (active) setState((now) => ({ ...now, error: 'Could not refresh just now. Trying again…' }))
      }
      // A hidden tab does not poll; it catches up as soon as it is looked at again.
      if (active && document.visibilityState !== 'hidden') timer = setTimeout(ask, RIDER_POLL_MS)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') ask()
    }
    if (document.visibilityState !== 'hidden') ask()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [deliveryId])

  const { location, minutes, error, everShown } = state
  if (!location && !everShown) return null

  const rider = location ? { lat: location.latitude, lng: location.longitude } : null
  return (
    <div className="mt-3.5 rounded-tile border border-line-warm bg-paper-warm p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink/45">Your rider</p>
      {rider ? (
        <>
          <p className="mt-1 text-[13px] text-ink">Last seen {minutes < 1 ? 'just now' : `${minutes} min ago`}.</p>
          <div className="mt-3 overflow-hidden rounded-tile">
            <DeliveryMap destination={latLngOfGeoPoint(destination)} rider={rider} />
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink/50">
            The dot moves while your rider shares their location. They may have other orders to deliver before yours.
          </p>
        </>
      ) : (
        <p className="mt-1 text-[13px] text-ink">
          Your rider is not sharing their location right now. The map returns when they share it again.
        </p>
      )}
      {error ? <p className="mt-2 text-[12px] text-ink/45">{error}</p> : null}
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <h2 className="border-b border-line-warm pb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink/40">
      {children}
    </h2>
  )
}

// The order's journey. An icon per step: faint while ahead, clay while it is
// the step in progress, forest once done — and the line through them fills the
// same way (a forest→clay gradient leads into the current step).
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
  RETURNED: 'Everything in this order went back to the store with the rider.',
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
          const segmentTone =
            i === 0
              ? null
              : i < current
                ? 'bg-forest'
                : i === current
                  ? 'bg-gradient-to-r from-forest to-clay'
                  : 'bg-line-warm'
          return (
            <Fragment key={stage.status}>
              {i > 0 && <li aria-hidden="true" className={`mx-1 mt-[17px] h-0.5 flex-1 rounded-full ${segmentTone}`} />}
              <li className="flex min-w-[72px] flex-col items-center gap-1.5 text-center">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors ${
                    done
                      ? 'border-forest bg-forest text-cream'
                      : isCurrent
                        ? 'border-clay bg-cream text-clay'
                        : 'border-line-warm bg-paper-warm text-ink/25'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className={`text-[10.5px] font-medium leading-tight sm:text-[11.5px] ${done || isCurrent ? 'text-ink' : 'text-ink/35'}`}>
                  {stage.label}
                </span>
                {time && <span className="hidden text-[10px] text-ink/35 sm:block">{time}</span>}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </div>
  )
}

// What arrived when the rider finished the order (docs/22 §F). The order keeps
// the outcome even when nothing came back; the Return only exists when it did.
function WhatArrived({ order, returnDoc }) {
  if (!order.fulfilment) return null
  const returned = Number(order.returnedAmount || 0)
  const refunded = Number(returnDoc?.refundAmount || 0)
  const net = order.netTotal ?? order.total
  const outcome =
    order.fulfilment === 'FULL'
      ? 'Everything arrived.'
      : order.fulfilment === 'NONE'
        ? 'Your whole order went back to the store.'
        : 'Part of your order came back.'
  return (
    <div className="mt-4 rounded-tile border border-line-warm bg-canvas/60 p-4">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        <RotateCcw className="h-4 w-4 text-clay" aria-hidden="true" />
        {outcome}
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink/55">
        {order.fulfilment === 'FULL'
          ? 'All the items you ordered were delivered.'
          : order.fulfilment === 'NONE'
            ? 'The rider took every item back. You are only charged for goods you kept.'
            : `${formatPrice(returned)} of goods went back with the rider. You pay only for what you kept.`}
      </p>
      <dl className="mt-3 space-y-1.5 text-[12.5px]">
        {returned > 0 && (
          <div className="flex justify-between">
            <dt className="text-ink/50">Goods returned</dt>
            <dd className="text-ink">{formatPrice(returned)}</dd>
          </div>
        )}
        {order.feeRefunded && (
          <div className="flex justify-between">
            <dt className="text-ink/50">Delivery fee refunded</dt>
            <dd className="text-ink">{formatPrice(order.deliveryFee)}</dd>
          </div>
        )}
        {refunded > 0 && (
          <div className="flex justify-between">
            <dt className="text-ink/50">Refunded to you</dt>
            <dd className="text-ink">{formatPrice(refunded)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-line-warm pt-1.5 text-[13px] font-semibold">
          <dt className="text-ink">Final total</dt>
          <dd className="text-ink">{formatPrice(net)}</dd>
        </div>
      </dl>
    </div>
  )
}

export default function MyOrderDetail() {
  const { id } = useParams()
  const [state, setState] = useState({ id: null, order: null, payment: null, delivery: null, adjustments: [], adjustment: null, returnDoc: null, error: '' })
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState({ text: '', tone: 'ok' })
  const [myReviews, setMyReviews] = useState([])

  useEffect(() => {
    let active = true
    api
      .get(`/orders/${id}`)
      .then(
        (res) =>
          active &&
          setState({
            id,
            order: res.data.order,
            payment: res.data.payment,
            delivery: res.data.delivery,
            adjustments: res.data.adjustments || [],
            adjustment: res.data.adjustment || null,
            returnDoc: res.data.return || null,
            error: '',
          }),
      )
      .catch(
        (err) =>
          active &&
          setState({ id, order: null, payment: null, delivery: null, adjustments: [], adjustment: null, returnDoc: null, error: getErrorMessage(err) }),
      )
    return () => {
      active = false
    }
  }, [id])

  async function refresh() {
    const res = await api.get(`/orders/${id}`)
    setState({
      id,
      order: res.data.order,
      payment: res.data.payment,
      delivery: res.data.delivery,
      adjustments: res.data.adjustments || [],
      adjustment: res.data.adjustment || null,
      returnDoc: res.data.return || null,
      error: '',
    })
  }

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
      <div className="bg-canvas">
        <div className={`${shell} max-w-4xl space-y-4 pb-16 pt-10 sm:pt-14`}>
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-36 w-full rounded-panel" />
          <Skeleton className="h-48 w-full rounded-panel" />
        </div>
      </div>
    )

  if (!state.order) {
    return (
      <div className="bg-canvas">
        <div className={`${shell} max-w-4xl pb-16 pt-10 sm:pt-14`}>
          <ErrorState title="We couldn't load this order" message={state.error} />
          <p className="mt-5 text-center">
            <Link to="/orders" className="text-[12.5px] font-medium text-clay underline-offset-4 hover:underline">
              Back to my orders
            </Link>
          </p>
        </div>
      </div>
    )
  }

  const { order, payment, delivery, adjustment, returnDoc } = state
  const a = order.shippingAddress || {}
  const problem = TERMINAL_PROBLEMS[order.orderStatus]
  const returnedByItem = new Map((returnDoc?.lines || []).map((line) => [String(line.orderItemId), line]))
  const finalTotal = order.netTotal ?? order.total

  return (
    <div className="bg-canvas">
      <div className={`${shell} max-w-4xl pb-16 pt-10 sm:pt-14`}>
        <Link to="/orders" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink/50 transition hover:text-ink">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          My orders
        </Link>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className={display.md}>{order.orderNumber}</h1>
          <p className="text-[12.5px] text-ink/60">Placed {formatDateTime(order.createdAt)}</p>
        </div>

        {notice.text && (
          <p
            role="status"
            className={`mt-5 rounded-tile border px-3.5 py-2.5 text-[12.5px] ${
              notice.tone === 'ok' ? 'border-forest/20 bg-sage/60 text-forest' : 'border-clay/20 bg-clay/5 text-clay'
            }`}
          >
            {notice.text}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-3 text-[12.5px]">
          <span className="flex items-center gap-2">
            <span className="text-ink/60">Order</span>
            <StatusPill value={order.orderStatus} />
          </span>
          <span className="flex items-center gap-2">
            <span className="text-ink/60">Payment</span>
            <StatusPill value={payment?.status || order.paymentStatus} />
          </span>
          {delivery && (
            <span className="flex items-center gap-2">
              <span className="text-ink/60">Delivery</span>
              <StatusPill value={delivery.status} />
            </span>
          )}
        </div>

        {adjustment?.status === 'PROPOSED' && (
          <OrderChangePrompt order={order} adjustment={adjustment} onChanged={refresh} onMessage={setNotice} />
        )}

        {/* Order progress — full width, above everything else */}
        <div className={`${panel} mt-6 p-5 sm:p-6`}>
          {problem ? (
            <p className="flex items-center gap-2.5 text-[13px] text-clay">
              <TriangleAlert className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              {problem}
            </p>
          ) : (
            <ProgressStepper history={order.statusHistory} orderStatus={order.orderStatus} />
          )}
          <WhatArrived order={order} returnDoc={returnDoc} />
        </div>

        <div className="mt-9 grid gap-10 lg:grid-cols-[1fr_17rem]">
          <section>
            <SectionTitle>Items</SectionTitle>
            <ul className="divide-y divide-line-warm">
              {order.items.map((item) => {
                const back = returnedByItem.get(String(item._id))
                const deliveredQty = item.quantity - (back?.quantity || 0)
                return (
                  <li key={`${item.productId}-${item.sku || ''}`} className="py-4 text-[13px]">
                    <div className="flex items-start gap-4">
                      <Link
                        to={`/product/${item.productId}`}
                        className="block w-14 shrink-0 overflow-hidden rounded-tile bg-sand"
                      >
                        <ProductImage src={item.image} name={item.productName} className="aspect-square w-full" />
                      </Link>
                      <div className="flex min-w-0 flex-1 flex-wrap justify-between gap-x-4 gap-y-1">
                        <span>
                          <Link to={`/product/${item.productId}`} className="font-medium text-ink transition hover:text-clay">
                            {item.productName}
                          </Link>
                          <span className="block text-ink/50">
                            {item.quantity} × {formatPrice(item.unitPrice)}
                          </span>
                          {order.fulfilment && (
                            <span className={`block text-[11.5px] ${back ? 'text-clay' : 'text-ink/55'}`}>
                              {back
                                ? `${deliveredQty > 0 ? `${deliveredQty} delivered · ` : 'All '}${back.quantity} returned — ${reasonLabel(back.reason)}`
                                : `${item.quantity} delivered`}
                            </span>
                          )}
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
                )
              })}
            </ul>
            <dl className="mt-2 space-y-2 border-t border-line-warm pt-4 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-ink/50">Subtotal</dt>
                <dd className="text-ink">{formatPrice(order.subtotal)}</dd>
              </div>
              {order.deliveryFee > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink/50">Delivery</dt>
                  <dd className="text-ink">{formatPrice(order.deliveryFee)}</dd>
                </div>
              )}
              {order.returnedAmount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink/50">Returned goods</dt>
                  <dd className="text-clay">− {formatPrice(order.returnedAmount)}</dd>
                </div>
              )}
              {order.feeRefunded && (
                <div className="flex justify-between">
                  <dt className="text-ink/50">Delivery fee refunded</dt>
                  <dd className="text-clay">− {formatPrice(order.deliveryFee)}</dd>
                </div>
              )}
              <div className="flex justify-between text-[15px] font-semibold">
                <dt className="text-ink">{order.fulfilment ? 'Final total' : 'Total (cash on delivery)'}</dt>
                <dd className="text-ink">{formatPrice(order.fulfilment ? finalTotal : order.total)}</dd>
              </div>
            </dl>
            {returnDoc?.refundAmount > 0 && (
              <p className="mt-2 text-[11.5px] text-ink/55">Refunded to your payment method: {formatPrice(returnDoc.refundAmount)}.</p>
            )}
            {payment?.status === 'PAID' && <ReceiptNote orderId={order._id} />}

            {delivery?.paymentPending && (
              <div className="mt-6 rounded-tile border border-line-warm bg-cream/40 p-4 sm:p-5">
                <p className="text-[13px] font-semibold text-ink">Payment being checked</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink/55">
                  You paid the rider. The brand is checking the payment; your order is complete as soon as it is confirmed.
                </p>
              </div>
            )}

            {order.orderStatus === 'PENDING' && (
              <div className="mt-8 rounded-tile border border-clay/25 bg-clay/5 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-clay" aria-hidden="true" />
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-ink">Changed your mind?</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink/55">
                      You can cancel until the brand confirms your order. Reserved stock returns automatically.
                    </p>
                    {confirming ? (
                      <div className="mt-3 flex flex-wrap gap-2.5">
                        <button
                          type="button"
                          onClick={cancel}
                          disabled={busy}
                          className="inline-flex h-9 items-center rounded-tile bg-danger px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-white transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
                        >
                          {busy ? 'Cancelling…' : 'Yes, cancel this order'}
                        </button>
                        <button type="button" onClick={() => setConfirming(false)} className={btn('outline', 'sm')}>
                          Keep it
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        className="mt-3 inline-flex h-9 items-center rounded-tile border border-danger/40 bg-paper-warm px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-danger transition hover:border-danger"
                      >
                        Cancel order
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-8 text-[13px]">
            <section>
              <SectionTitle>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  Delivering to
                </span>
              </SectionTitle>
              <address className="mt-3.5 not-italic leading-relaxed text-ink/70">
                <span className="font-medium text-ink">{a.name}</span>
                <br />
                {a.address}
                <br />
                {[a.city, a.state, a.postalCode].filter(Boolean).join(', ')}
                <br />
                {a.phone}
                {a.additionalInstructions && (
                  <span className="mt-2 block text-ink/55">Note: {a.additionalInstructions}</span>
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
                      <dt className="text-ink/55">Tracking reference</dt>
                      <dd className="font-medium text-ink">{delivery.trackingReference}</dd>
                    </div>
                  )}
                  {delivery.assignedAgent && (
                    <div>
                      <dt className="text-ink/55">Delivered by</dt>
                      <dd className="font-medium text-ink">{delivery.assignedAgent}</dd>
                    </div>
                  )}
                </dl>
                {delivery.status === 'FAILED' && (
                  <p className="mt-3 rounded-tile bg-clay/5 px-3.5 py-2.5 text-[12px] text-clay">
                    The last delivery attempt did not go through. The brand will try again.
                  </p>
                )}
              </section>
            )}

            {delivery?.status === 'OUT_FOR_DELIVERY' && (
              <RiderLocation deliveryId={delivery._id} destination={order.deliveryLocation} />
            )}

            {delivery && ON_THE_ROAD.includes(delivery.status) && <DeliveryCode deliveryId={delivery._id} />}
          </aside>
        </div>
      </div>
    </div>
  )
}
