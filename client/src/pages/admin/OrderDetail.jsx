import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api, { getErrorMessage } from '../../services/api'
import { PageHeader, StatusBadge } from '../../components/brand/Bits'
import { formatDateTime, formatPrice, humanize } from '../../ui'

// Read-only: the super admin sees an order exactly as the brand and customer do, but cannot change it here.
export default function OrderDetail() {
  const { id } = useParams()
  const [state, setState] = useState({ id: null, order: null, payment: null, delivery: null, brandName: '', error: '' })

  useEffect(() => {
    let active = true
    api
      .get(`/orders/${id}`)
      .then(async (res) => {
        const { order, payment, delivery } = res.data
        let brandName = ''
        try {
          brandName = (await api.get(`/admin/brands/${order.brandId}`)).data.brand.name
        } catch {
          /* the order is still shown without the brand name */
        }
        if (active) setState({ id, order, payment, delivery, brandName, error: '' })
      })
      .catch((err) => active && setState({ id, order: null, payment: null, delivery: null, brandName: '', error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [id])

  if (state.id !== id) return <div className="h-64 animate-pulse bg-sand" />
  if (!state.order) {
    return (
      <>
        <p className="text-clay">{state.error}</p>
        <Link to="/admin/orders" className="mt-4 inline-block text-sm font-medium text-clay hover:underline">
          Back to orders
        </Link>
      </>
    )
  }

  const { order, payment, delivery, brandName } = state
  const a = order.shippingAddress || {}

  return (
    <>
      <PageHeader
        title={order.orderNumber}
        intro={`${brandName || 'Unknown brand'} · placed ${formatDateTime(order.createdAt)}`}
        action={
          <Link to="/admin/orders" className="text-[13px] font-medium text-clay hover:underline">
            Back to orders
          </Link>
        }
      />

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
            <h2 className="border-b border-ink pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Customer</h2>
            <address className="mt-3 not-italic leading-relaxed">
              <span className="font-medium">{a.name}</span>
              <br />
              {a.address}
              <br />
              {[a.city, a.state, a.postalCode].filter(Boolean).join(', ')}
              <br />
              {a.phone}
            </address>
          </section>

          {delivery && (delivery.trackingReference || delivery.assignedAgent) && (
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
                    <dt className="text-muted">Agent</dt>
                    <dd className="font-medium">{delivery.assignedAgent}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

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