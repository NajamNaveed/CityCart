import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock, CheckCircle2, Clock3, ExternalLink, MapPin, Star, Wrench } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { PageHeader, StatCard, StatusBadge } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import { formatDate, formatPrice } from '../../ui'
import { bookingWhen } from '../../utils/serviceBookings'
import { formatKarachiDateTime } from '../../utils/serviceSlots'

const money = (paisa) => formatPrice((paisa ?? 0) / 100)

function Row({ label, children }) {
  if (!children) return null
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <dt className="text-ink/55">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  )
}

function QuickAction({ to, icon: Icon, title, hint, external = false }) {
  const className =
    'group flex items-center gap-3.5 rounded-card border border-line-warm bg-paper-warm px-4 py-3.5 transition hover:border-ink/20 hover:bg-cream/40'
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-tile bg-sand text-ink/60">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-ink">{title}</span>
        <span className="block text-[12px] text-ink/55">{hint}</span>
      </span>
      {external ? (
        <ExternalLink className="h-4 w-4 shrink-0 text-ink/25 transition group-hover:text-ink/50" aria-hidden="true" />
      ) : (
        <ArrowRight className="h-4 w-4 shrink-0 text-ink/25 transition group-hover:translate-x-0.5 group-hover:text-ink/50" aria-hidden="true" />
      )}
    </>
  )
  if (external) {
    return (
      <a href={to} target="_blank" rel="noreferrer" className={className}>
        {body}
      </a>
    )
  }
  return (
    <Link to={to} className={className}>
      {body}
    </Link>
  )
}

export default function ProviderOverview() {
  const { user, refresh } = useAuth()
  const [state, setState] = useState({ loaded: false, provider: null, requests: 0, next: null, error: '' })

  useEffect(() => {
    let active = true
    Promise.all([
      api.get('/services/provider/me'),
      api.get('/services/provider/bookings', { params: { status: 'REQUESTED', limit: 1 } }),
      api.get('/services/provider/bookings', { params: { status: 'CONFIRMED', limit: 20 } }),
    ])
      .then(([me, requested, confirmed]) => {
        if (!active) return
        const now = Date.now()
        const next =
          confirmed.data.bookings
            .filter((booking) => bookingWhen(booking) && new Date(bookingWhen(booking)).getTime() >= now)
            .sort((a, b) => new Date(bookingWhen(a)) - new Date(bookingWhen(b)))[0] || null
        setState({
          loaded: true,
          provider: me.data.provider,
          requests: requested.data.pagination?.total || 0,
          next,
          error: '',
        })
      })
      .catch((err) => active && setState({ loaded: true, provider: null, requests: 0, next: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [])

  // /auth/me carries the status; a just-approved provider sees the banner
  // clear on the next session refresh without signing out.
  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  if (!state.loaded) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full rounded-card" />
        <Skeleton className="h-56 w-full rounded-card" />
      </div>
    )
  }

  if (!state.provider) {
    return (
      <>
        <PageHeader title="Your provider dashboard" />
        <p role="alert" className="rounded-tile border border-clay/20 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">{state.error}</p>
      </>
    )
  }

  const provider = state.provider
  const pending = provider.status === 'PENDING'
  const active = provider.status === 'ACTIVE'

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(' ')[0]}`}
        intro="Your bookings, service profile and area in one place."
        action={<StatusBadge value={provider.status} />}
      />

      {pending && (
        <section className="mb-6 rounded-card border border-[#e5d2a9] bg-[#f8efd9] p-6">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[#855811]" aria-hidden="true" />
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Your application is under review</h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink/60">
                Customers cannot find your service yet. You can edit everything below while you wait — nothing is lost
                when you are approved.
              </p>
            </div>
          </div>
          <ol className="mt-5 space-y-2.5 text-[13.5px]">
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className={`h-4 w-4 ${user.emailVerified ? 'text-forest' : 'text-ink/55'}`} aria-hidden="true" />
              <span className={user.emailVerified ? 'text-ink' : 'text-ink/55'}>
                {user.emailVerified ? 'Email verified' : 'Verify your email from the link we sent'}
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[#855811]/40" aria-hidden="true">
                <span className="h-1.5 w-1.5 rounded-full bg-[#855811]" />
              </span>
              <span className="text-ink">CityCart admin review</span>
            </li>
          </ol>
        </section>
      )}

      {active && (
        <section className="mb-6 rounded-card border border-forest/20 bg-sage/60 p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-forest" aria-hidden="true" />
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Your service is live</h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink/60">
                Customers in {provider.block?.name || 'your block'} can find you. Bookings and messages will appear here
                as they arrive.
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CalendarClock}
          label="New requests"
          value={state.requests}
          hint={state.requests ? 'Waiting for your answer' : 'Nothing waiting right now'}
          tone={state.requests ? 'warn' : 'good'}
          to="/provider/bookings?status=REQUESTED"
        />
        <StatCard
          icon={Clock3}
          label="Next booking"
          value={state.next ? formatDate(bookingWhen(state.next)) : '—'}
          hint={state.next ? `${formatKarachiDateTime(bookingWhen(state.next))}${state.next.customer?.name ? ` · ${state.next.customer.name}` : ''}` : 'No confirmed booking scheduled'}
          to="/provider/bookings"
        />
        <StatCard
          icon={Star}
          label="Rating"
          value={provider.ratingCount > 0 ? `${provider.ratingAvg.toFixed(1)} / 5` : '—'}
          hint={provider.ratingCount > 0 ? `${provider.ratingCount} review${provider.ratingCount === 1 ? '' : 's'}` : 'No reviews yet'}
          to="/provider/reviews"
        />
        <StatCard
          icon={Wrench}
          label="Starting price"
          value={provider.startingAtPrice != null ? money(provider.startingAtPrice) : '—'}
          hint={provider.category?.name || 'Set up your services'}
          to="/provider/offerings"
        />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">Quick actions</h2>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <QuickAction to="/provider/bookings" icon={CalendarClock} title="Open bookings" hint="Accept requests and send prices" />
          <QuickAction to="/provider/offerings" icon={Wrench} title="Services & prices" hint="What customers can book" />
          <QuickAction to="/provider/availability" icon={Clock3} title="Working hours" hint="When you take jobs" />
          <QuickAction
            to={`/services/${provider.slug}`}
            icon={MapPin}
            title="View your public page"
            hint="What customers see"
            external
          />
        </div>
      </section>

      <section className="mt-8 rounded-card border border-line-warm bg-paper-warm p-6">
        <h2 className="border-b border-line-warm pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">
          Profile details
        </h2>
        <dl className="divide-y divide-line-warm text-sm">
          <Row label="Service">{provider.category?.name}</Row>
          <Row label="Starting price">{money(provider.startingAtPrice)}</Row>
          <Row label="City">{provider.city?.name}</Row>
          <Row label="Block">{provider.block?.name}</Row>
          <Row label="Public link">
            <Link to={`/services/${provider.slug}`} className="font-medium text-forest hover:underline">
              /services/{provider.slug}
            </Link>
          </Row>
          <Row label="Completed jobs">{provider.completedBookings}</Row>
          <Row label="Member since">{formatDate(provider.createdAt)}</Row>
          <Row label="Approved">{provider.approvedAt ? formatDate(provider.approvedAt) : ''}</Row>
        </dl>
      </section>
    </>
  )
}
