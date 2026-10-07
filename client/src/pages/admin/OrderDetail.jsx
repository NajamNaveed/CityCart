import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { PageHeader, StatusBadge } from '../../components/brand/Bits'
import ProductImage from '../../components/ProductImage'
import { Skeleton } from '../../components/ui'
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

  if (state.id !== id)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
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
      <Link to="/admin/orders" className="inline-flex items-center gap-1 text-[13px] text-muted transition hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        All orders
      </Link>
      <PageHeader
        title={order.orderNumber}
        intro={`${brandName || 'Unknown brand'} · placed ${formatDateTime(order.createdAt)}`}
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

      <div className="grid gap-10 lg:grid-cols-[1fr_17rem]">
        <section>
          <h2 className="border-b border-line pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Items</h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {order.items.map((item) => (
              <li key={`${item.productId}-${item.sku || ''}`} className="flex items-start gap-4 px-5 py-4 text-sm">
                <div className="block w-14 shrink-0 overflow-hidden rounded-md bg-sand">
                  <ProductImage src={item.image} name={item.productName} className="aspect-square w-full" />
                </div>
                <span className="min-w-0 flex-1">
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
            <h2 className="border-b border-line pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Customer</h2>
            <address className="mt-3.5 not-italic leading-relaxed text-ink/90">
              <span className="font-medium text-ink">{a.name}</span>
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
              <h2 className="border-b border-line pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Delivery</h2>
              <dl className="mt-3.5 space-y-2.5">
                {delivery.trackingReference && (
                  <div>
                    <dt className="text-muted">Tracking reference</dt>
                    <dd className="font-medium text-ink">{delivery.trackingReference}</dd>
                  </div>
                )}
                {delivery.assignedAgent && (
                  <div>
                    <dt className="text-muted">Agent</dt>
                    <dd className="font-medium text-ink">{delivery.assignedAgent}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {order.statusHistory?.length > 0 && (
            <section>
              <h2 className="border-b border-line pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">History</h2>
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