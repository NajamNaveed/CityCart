import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BadgeCheck, CalendarClock, CheckCircle2, Clock3, LibraryBig, Package, Store } from 'lucide-react'
import api from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { PageHeader, StatCard, StatusBadge } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import { ADMIN_PERMISSIONS, adminCan } from '../../utils/adminPermissions'
import { formatDateTime, formatPrice } from '../../ui'

const countOf = (settled) =>
  settled?.status === 'fulfilled' && settled.value ? (settled.value.data.pagination?.total ?? 0) : null

export default function Overview() {
  const { user } = useAuth()
  const [data, setData] = useState(null)

  useEffect(() => {
    let active = true
    const isSuper = user.role === 'SUPER_ADMIN'
    const canCatalog = adminCan(user, ADMIN_PERMISSIONS.CATALOG)
    Promise.allSettled([
      api.get('/admin/brands', { params: { limit: 1 } }),
      api.get('/admin/brands', { params: { status: 'ACTIVE', limit: 1 } }),
      api.get('/admin/brands', { params: { status: 'PENDING', limit: 1 } }),
      api.get('/admin/orders', { params: { limit: 1 } }),
      api.get('/admin/orders', { params: { status: 'PENDING', limit: 1 } }),
      api.get('/admin/orders', { params: { limit: 5 } }),
      api.get('/admin/service-bookings', { params: { disputed: 'true', limit: 1 } }),
      isSuper ? api.get('/admin/providers', { params: { status: 'PENDING', limit: 1 } }) : Promise.resolve(null),
      canCatalog ? api.get('/admin/catalog', { params: { status: 'PENDING', limit: 1 } }) : Promise.resolve(null),
    ]).then(([brands, activeBrands, pendingBrands, orders, pendingOrders, recent, disputes, providerApps, catalog]) => {
      if (!active) return
      setData({
        brands: countOf(brands),
        activeBrands: countOf(activeBrands),
        pendingBrands: countOf(pendingBrands),
        orders: countOf(orders),
        pendingOrders: countOf(pendingOrders),
        disputes: countOf(disputes),
        providerApps: countOf(providerApps),
        catalog: countOf(catalog),
        recent: recent.status === 'fulfilled' ? recent.value.data.orders : null,
      })
    })
    return () => {
      active = false
    }
  }, [user])

  const cards = [
    { icon: Store, label: 'Brands', value: data?.brands, to: '/admin/brands', tone: 'quiet' },
    { icon: Package, label: 'Orders', value: data?.orders, to: '/admin/orders', tone: 'quiet' },
    {
      icon: Clock3,
      label: 'Awaiting confirmation',
      value: data?.pendingOrders,
      to: '/admin/orders?status=PENDING',
      tone: data?.pendingOrders > 0 ? 'warn' : 'quiet',
    },
    {
      icon: CalendarClock,
      label: 'Open disputes',
      value: data?.disputes,
      to: '/admin/service-bookings?disputed=true',
      tone: data?.disputes > 0 ? 'bad' : 'quiet',
    },
  ]

  const queues = [
    data?.providerApps != null && {
      label: 'Provider applications',
      count: data.providerApps,
      to: '/admin/providers?status=PENDING',
      icon: BadgeCheck,
      hint: 'Review and approve new service providers.',
    },
    data?.pendingBrands != null && {
      label: 'Brand applications',
      count: data.pendingBrands,
      to: '/admin/brands?status=PENDING',
      icon: Store,
      hint: 'Shops waiting for a decision.',
    },
    data?.pendingOrders != null && {
      label: 'Orders awaiting confirmation',
      count: data.pendingOrders,
      to: '/admin/orders?status=PENDING',
      icon: Package,
      hint: 'Chase the store so the customer is not left waiting.',
    },
    data?.disputes != null && {
      label: 'Service disputes',
      count: data.disputes,
      to: '/admin/service-bookings?disputed=true',
      icon: CalendarClock,
      hint: 'Bookings the customer or provider escalated.',
    },
    data?.catalog != null && {
      label: 'Catalogue approvals',
      count: data.catalog,
      to: '/admin/catalogue',
      icon: LibraryBig,
      hint: 'Products a store asked to add to the shared catalogue.',
    },
  ].filter(Boolean)

  const openCount = queues.reduce((sum, queue) => sum + queue.count, 0)

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(' ')[0]}`}
        intro={data?.activeBrands != null ? `${data.activeBrands} active brands trading on the platform.` : 'The platform at a glance.'}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <StatCard
            key={card.label}
            icon={card.icon}
            label={card.label}
            value={!data ? '…' : card.value ?? '—'}
            to={card.to}
            tone={card.tone}
          />
        ))}
      </div>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Needs attention</h2>
            <p className="mt-1 text-[12.5px] text-ink/55">Queues that are waiting on a platform decision.</p>
          </div>
          {data && queues.length > 0 && (
            <p className="text-[12.5px] text-ink/55">
              {openCount} {openCount === 1 ? 'item' : 'items'} across {queues.length} {queues.length === 1 ? 'queue' : 'queues'}
            </p>
          )}
        </div>

        {!data ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-card" />
            ))}
          </div>
        ) : queues.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-warm bg-paper-warm p-8 text-center text-sm text-ink/55">
            Nothing to review in the areas you can open.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {queues.map(({ label, count, to, icon: Icon, hint }) => (
              <Link
                key={label}
                to={to}
                className="group flex items-start gap-3.5 rounded-card border border-line-warm bg-paper-warm p-4 transition duration-300 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-[0_18px_35px_rgba(21,20,15,0.07)]"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-tile ${
                    count > 0 ? 'bg-[#f8efd9] text-[#855811]' : 'bg-sage text-forest'
                  }`}
                >
                  {count > 0 ? (
                    <Icon className="h-[17px] w-[17px]" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-[17px] w-[17px]" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[13.5px] font-medium text-ink">{label}</span>
                    <span className={`font-display text-lg font-semibold ${count > 0 ? 'text-[#855811]' : 'text-ink/40'}`}>{count}</span>
                  </span>
                  <span className="mt-1 block text-[12px] leading-relaxed text-ink/55">
                    {count > 0 ? hint : 'Nothing waiting.'}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Latest orders</h2>
          <Link
            to="/admin/orders"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-clay transition hover:text-clay-dark"
          >
            All orders
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        {!data ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-card" />
            ))}
          </div>
        ) : !data.recent ? (
          <p role="alert" className="rounded-card border border-clay/20 bg-clay/10 p-5 text-sm text-clay">
            Orders could not be loaded. Refresh the page to try again.
          </p>
        ) : data.recent.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-warm bg-paper-warm p-8 text-center text-sm text-ink/55">
            No orders have been placed yet.
          </p>
        ) : (
          <ul className="divide-y divide-line-warm rounded-card border border-line-warm bg-paper-warm">
            {data.recent.map((o) => (
              <li key={o._id}>
                <Link
                  to={`/admin/orders/${o._id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-cream/40"
                >
                  <span>
                    <span className="block text-[13.5px] font-medium text-ink">{o.orderNumber}</span>
                    <span className="text-xs text-ink/55">
                      {o.brandName || 'Unknown brand'} · {formatDateTime(o.createdAt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-4">
                    <StatusBadge value={o.orderStatus} />
                    <span className="w-24 text-right text-sm font-semibold text-ink">{formatPrice(o.total)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
