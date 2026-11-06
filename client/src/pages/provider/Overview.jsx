import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Clock3, MapPin, Settings, Star } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { PageHeader, StatusBadge } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import { formatDate, formatPrice } from '../../ui'

const money = (paisa) => formatPrice((paisa ?? 0) / 100)

function Row({ label, children }) {
  if (!children) return null
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  )
}

export default function ProviderOverview() {
  const { user, refresh } = useAuth()
  const [state, setState] = useState({ loaded: false, provider: null, error: '' })

  useEffect(() => {
    let active = true
    api
      .get('/services/provider/me')
      .then((res) => active && setState({ loaded: true, provider: res.data.provider, error: '' }))
      .catch((err) => active && setState({ loaded: true, provider: null, error: getErrorMessage(err) }))
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
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
    )
  }

  if (!state.provider) {
    return (
      <>
        <PageHeader title="Your provider dashboard" />
        <p className="text-clay">{state.error}</p>
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
        intro="Your service profile, area and status in one place."
        action={<StatusBadge value={provider.status} />}
      />

      {pending && (
        <section className="mb-6 rounded-lg border border-warning/30 bg-warning-soft p-6">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Your application is under review</h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                Customers cannot find your service yet. You can edit everything below while you wait — nothing is lost
                when you are approved.
              </p>
            </div>
          </div>
          <ol className="mt-5 space-y-2.5 text-[13.5px]">
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className={`h-4 w-4 ${user.emailVerified ? 'text-success' : 'text-muted'}`} aria-hidden="true" />
              <span className={user.emailVerified ? 'text-ink' : 'text-muted'}>
                {user.emailVerified ? 'Email verified' : 'Verify your email from the link we sent'}
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-warning" aria-hidden="true">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
              </span>
              <span className="text-ink">CityCart admin review</span>
            </li>
          </ol>
        </section>
      )}

      {active && (
        <section className="mb-6 rounded-lg border border-success/25 bg-success-soft p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Your service is live</h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                Customers in {provider.block?.name || 'your block'} can find you. Bookings and messages will appear here
                as they arrive.
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/provider/profile"
          className="group rounded-lg border border-line bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-lg hover:shadow-ink/5"
        >
          <div className="flex items-start justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-paper text-ink/70">
              <Settings className="h-5 w-5" aria-hidden="true" />
            </span>
            <ArrowRight className="h-4 w-4 text-muted/50 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true" />
          </div>
          <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Service profile</p>
          <p className="mt-1.5 truncate text-[15px] font-semibold text-ink">{provider.displayName}</p>
        </Link>

        <Link
          to="/provider/area"
          className="group rounded-lg border border-line bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-lg hover:shadow-ink/5"
        >
          <div className="flex items-start justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-paper text-ink/70">
              <MapPin className="h-5 w-5" aria-hidden="true" />
            </span>
            <ArrowRight className="h-4 w-4 text-muted/50 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true" />
          </div>
          <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Service area</p>
          <p className="mt-1.5 truncate text-[15px] font-semibold text-ink">
            {[provider.block?.name, provider.city?.name].filter(Boolean).join(', ') || 'Not set'}
          </p>
        </Link>

        <div className="rounded-lg border border-line bg-white p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-paper text-ink/70">
            <Star className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Rating</p>
          <p className="mt-1.5 text-[15px] font-semibold text-ink">
            {provider.ratingCount > 0 ? `${provider.ratingAvg.toFixed(1)} · ${provider.ratingCount} review${provider.ratingCount === 1 ? '' : 's'}` : 'No reviews yet'}
          </p>
        </div>
      </div>

      <section className="mt-8 rounded-lg border border-line bg-white p-6">
        <h2 className="border-b border-line pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
          Profile details
        </h2>
        <dl className="divide-y divide-line text-sm">
          <Row label="Service">{provider.category?.name}</Row>
          <Row label="Starting price">{money(provider.startingAtPrice)}</Row>
          <Row label="City">{provider.city?.name}</Row>
          <Row label="Block">{provider.block?.name}</Row>
          <Row label="Public link">/{provider.slug}</Row>
          <Row label="Completed jobs">{provider.completedBookings}</Row>
          <Row label="Member since">{formatDate(provider.createdAt)}</Row>
          <Row label="Approved">{provider.approvedAt ? formatDate(provider.approvedAt) : ''}</Row>
        </dl>
      </section>
    </>
  )
}
