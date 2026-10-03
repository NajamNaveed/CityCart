import { Link, Navigate, useLocation } from 'react-router-dom'
import { btnOutline, btnPrimary, formatPrice, wrap } from '../ui'

export default function OrderPlaced() {
  const { state } = useLocation()
  const orders = state?.orders

  // Opened directly (or refreshed): there is nothing to confirm, so show the order history instead.
  if (!orders?.length) return <Navigate to="/orders" replace />

  const total = orders.reduce((sum, o) => sum + o.total, 0)

  return (
    <div className={`${wrap} max-w-3xl py-16`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Order placed</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Thank you for your order.</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        {orders.length > 1
          ? `We have placed ${orders.length} orders, one for each brand. Each brand will confirm and deliver its own.`
          : 'The brand will confirm it shortly.'}{' '}
        Pay {formatPrice(total)} in cash on delivery.
      </p>

      <ul className="mt-10 divide-y divide-line border-y border-line">
        {orders.map((o) => (
          <li key={o._id} className="flex items-center justify-between gap-4 py-4">
            <span>
              <Link to={`/orders/${o._id}`} className="font-medium hover:text-clay">
                {o.orderNumber}
              </Link>
              <span className="block text-sm text-muted">
                {o.items.length} {o.items.length === 1 ? 'item' : 'items'}
              </span>
            </span>
            <span className="font-semibold">{formatPrice(o.total)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link to="/orders" className={btnPrimary}>
          View my orders
        </Link>
        <Link to="/shop" className={btnOutline}>
          Keep shopping
        </Link>
      </div>
    </div>
  )
}