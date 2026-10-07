import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, TriangleAlert } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { Notice, PageHeader, StatusBadge } from '../../components/brand/Bits'
import DeliveryPanel from '../../components/brand/DeliveryPanel'
import { useCan } from '../../hooks/useCan'
import { Skeleton } from '../../components/ui'
import { formatDateTime, formatPrice, humanize } from '../../ui'

// What a brand may do next. The server re-checks every move, so this only decides which buttons to offer.
// From "ready for shipment" onwards the delivery panel takes over.
const ACTIONS = {
  PENDING: [['CONFIRMED', 'Confirm order', true], ['REJECTED', 'Reject', false]],
  CONFIRMED: [['PROCESSING', 'Start processing', true], ['REJECTED', 'Reject', false]],
  PROCESSING: [['READY_FOR_SHIPMENT', 'Mark ready for shipment', true]],
}

const primaryBtn =
  'inline-flex h-10 items-center rounded-md bg-pine px-5 text-[12px] font-medium uppercase tracking-[0.08em] text-white transition hover:bg-pine-dark disabled:opacity-50'

function SectionTitle({ children }) {
  return (
    <h2 className="border-b border-line pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
      {children}
    </h2>
  )
}

export default function OrderDetail() {
  const { id } = useParams()
  const can = useCan()
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

  if (state.id !== id)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )

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
  const actions = can('orders.manage') ? ACTIONS[order.orderStatus] || [] : []
  const a = order.shippingAddress || {}
  const rejected = order.orderStatus === 'REJECTED'

  return (
    <>
      <Link to="/brand/orders" className="inline-flex items-center gap-1 text-[13px] text-muted transition hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        All orders
      </Link>
      <PageHeader
        title={order.orderNumber}
        intro={`Placed ${formatDateTime(order.createdAt)}`}
        action={
          <span className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
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
          </span>
        }
      />
      <Notice tone={message.tone}>{message.text}</Notice>

      {actions.length > 0 && (
        <div className="mb-8 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-5">
          <span className="mr-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Next step</span>
          {actions.map(([status, label, primary]) =>
            primary ? (
              <button key={status} type="button" disabled={busy} onClick={() => move(status)} className={primaryBtn}>
                {label}
              </button>
            ) : confirmReject ? (
              <span key={status} className="flex flex-wrap items-center gap-3 rounded-md bg-danger-soft px-3.5 py-2 text-sm">
                <TriangleAlert className="h-4 w-4 text-danger" aria-hidden="true" />
                <span className="text-ink">Reject and return the stock?</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => move(status)}
                  className="inline-flex h-8 items-center rounded-md bg-danger px-3 text-[12.5px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  Yes, reject
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReject(false)}
                  className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[12.5px] font-medium text-ink transition hover:border-ink"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                key={status}
                type="button"
                disabled={busy}
                onClick={() => setConfirmReject(true)}
                className="inline-flex h-10 items-center rounded-md border border-danger/40 bg-white px-4 text-[12.5px] font-medium text-danger transition hover:border-danger"
              >
                {label}
              </button>
            ),
          )}
        </div>
      )}

      {rejected && (
        <p className="mb-8 flex items-center gap-2.5 rounded-md bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          This order was rejected. Stock has been returned to your inventory.
        </p>
      )}

      {delivery && can('delivery.manage') && <DeliveryPanel key={delivery._id} delivery={delivery} onChanged={async () => setState(await fetchOrder())} />}

      <div className="grid gap-10 lg:grid-cols-[1fr_17rem]">
        <section>
          <SectionTitle>Items</SectionTitle>
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {order.items.map((item) => (
              <li key={`${item.productId}-${item.sku || ''}`} className="flex justify-between gap-4 px-5 py-4 text-sm">
                <span>
                  <span className="font-medium text-ink">{item.productName}</span>
                  <span className="block text-muted">
                    {item.quantity} × {formatPrice(item.unitPrice)}
                  </span>
                </span>
                <span className="font-semibold text-ink">{formatPrice(item.totalPrice)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 text-sm">
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
            <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
              <dt className="text-ink">Total (cash on delivery)</dt>
              <dd className="text-ink">{formatPrice(order.total)}</dd>
            </div>
          </dl>
        </section>

        <aside className="space-y-9 text-sm">
          <section>
            <SectionTitle>Deliver to</SectionTitle>
            <address className="mt-3.5 not-italic leading-relaxed text-ink/90">
              <span className="font-medium text-ink">{a.name}</span>
              <br />
              {a.address}
              <br />
              {[a.city, a.state, a.postalCode].filter(Boolean).join(', ')}
              <br />
              <a href={`tel:${a.phone}`} className="text-pine transition hover:text-ink">
                {a.phone}
              </a>
              {a.additionalInstructions && <span className="mt-2 block text-muted">Note: {a.additionalInstructions}</span>}
            </address>
          </section>

          {order.statusHistory?.length > 0 && (
            <section>
              <SectionTitle>History</SectionTitle>
              <ol className="mt-3.5 space-y-2">
                {[...order.statusHistory].reverse().map((h) => (
                  <li key={h._id || `${h.status}-${h.at}`} className="flex justify-between gap-3">
                    <span className="text-ink/90">{humanize(h.status)}</span>
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
