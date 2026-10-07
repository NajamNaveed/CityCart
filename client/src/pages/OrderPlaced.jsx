import { Link, Navigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Package } from 'lucide-react'
import { Reveal } from '../components/ui'
import { btnOutline, btnPrimary, formatPrice, wrap } from '../ui'

export default function OrderPlaced() {
  const { state } = useLocation()
  const orders = state?.orders

  // Opened directly (or refreshed): there is nothing to confirm, so show the order history instead.
  if (!orders?.length) return <Navigate to="/orders" replace />

  const total = orders.reduce((sum, o) => sum + o.total, 0)

  return (
    <div className={`${wrap} max-w-3xl py-16`}>
      <Reveal className="text-center">
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success"
        >
          <Check className="h-8 w-8" strokeWidth={2.5} aria-hidden="true" />
        </motion.span>
        <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Order placed</p>
        <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight text-ink">
          Thank you for your order.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
          {orders.length > 1
            ? `We have placed ${orders.length} orders, one for each brand. Each brand will confirm and deliver its own.`
            : 'The brand will confirm it shortly.'}{' '}
          Pay {formatPrice(total)} in cash on delivery.
        </p>
      </Reveal>

      <Reveal delay={0.15}>
        <ul className="mt-10 space-y-3">
          {orders.map((o) => (
            <li key={o._id}>
              <Link
                to={`/orders/${o._id}`}
                className="group flex items-center gap-4 rounded-lg border border-line bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink/5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-sand text-clay">
                  <Package className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{o.orderNumber}</span>
                  <span className="block text-[13px] text-muted">
                    {o.items.length} {o.items.length === 1 ? 'item' : 'items'}
                  </span>
                </span>
                <span className="font-semibold text-ink">{formatPrice(o.total)}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/orders" className={btnPrimary}>
            View my orders
          </Link>
          <Link to="/shop" className={btnOutline}>
            Keep shopping
          </Link>
        </div>
      </Reveal>
    </div>
  )
}
