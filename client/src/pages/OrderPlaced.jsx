import { Link, Navigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Package } from 'lucide-react'
import { Button, accent, cardLift, display, shell } from '../design'
import { formatPrice } from '../ui'

export default function OrderPlaced() {
  const { state } = useLocation()
  const orders = state?.orders

  // Opened directly (or refreshed): there is nothing to confirm, so show the order history instead.
  if (!orders?.length) return <Navigate to="/orders" replace />

  const total = orders.reduce((sum, o) => sum + o.total, 0)

  return (
    <div className="bg-canvas">
      <div className={`${shell} max-w-3xl pb-16 pt-14 sm:pt-20`}>
        <div className="text-center">
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sage text-forest"
          >
            <Check className="h-8 w-8" strokeWidth={2.5} aria-hidden="true" />
          </motion.span>
          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink/45">Order placed</p>
          <h1 className={`mt-3 ${display.lg}`}>
            Thank you for your <em className={`whitespace-nowrap ${accent}`}>order.</em>
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-[13.5px] leading-relaxed text-ink/60 sm:text-[14.5px]">
            {orders.length > 1
              ? `We have placed ${orders.length} orders, one for each brand. Each brand will confirm and deliver its own.`
              : 'The brand will confirm it shortly.'}{' '}
            Pay <span className="font-medium text-ink">{formatPrice(total)}</span> in cash on delivery.
          </p>
        </div>

        <ul className="mt-10 space-y-3">
          {orders.map((o) => (
            <li key={o._id}>
              <Link
                to={`/orders/${o._id}`}
                className={`group flex items-center gap-4 rounded-card border border-line-warm bg-paper-warm p-5 ${cardLift}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tile bg-sand text-clay">
                  <Package className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{o.orderNumber}</span>
                  <span className="block text-[12.5px] text-ink/60">
                    {o.items.length} {o.items.length === 1 ? 'item' : 'items'}
                  </span>
                </span>
                <span className="font-semibold text-ink">{formatPrice(o.total)}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap justify-center gap-2.5">
          <Button to="/orders" tone="primary" size="md">
            View my orders
          </Button>
          <Button to="/nearby" tone="outline" size="md">
            Keep shopping
          </Button>
        </div>
      </div>
    </div>
  )
}
