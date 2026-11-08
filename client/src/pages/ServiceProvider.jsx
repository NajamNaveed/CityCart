import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, Clock3, MapPin, MessageCircle, Star, Wrench } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import ProductImage from '../components/ProductImage'
import Stars from '../components/Stars'
import BookingRequest from '../components/services/BookingRequest'
import { EmptyState, Skeleton, btn, card, panel, shell } from '../design'
import { useAuth } from '../hooks/useAuth'
import { usePageMeta } from '../hooks/usePageMeta'
import { breadcrumbLd, serviceLd } from '../utils/seo'
import { formatKarachiDate, minuteLabel } from '../utils/serviceSlots'
import { durationLabel } from '../utils/serviceBookings'
import { formatPrice } from '../ui'

const ServicesMap = lazy(() => import('../components/services/ServicesMap'))

const sectionLabel = 'text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink/45'
const sectionTitle = 'font-display mt-2 text-[24px] font-semibold tracking-tight text-ink sm:text-[28px]'

export default function ServiceProvider() {
  const { slug } = useParams()
  const { user } = useAuth()
  // `slug` is stored with the result so navigating to another provider shows
  // the skeleton instead of the previous provider while the new one loads.
  const [state, setState] = useState({ slug: null, loaded: false, provider: null, error: '' })

  useEffect(() => {
    let active = true
    api
      .get(`/services/providers/${encodeURIComponent(slug)}`)
      .then((res) => active && setState({ slug, loaded: true, provider: res.data.provider, error: '' }))
      .catch((err) => active && setState({ slug, loaded: true, provider: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [slug])

  const loadedProvider = state.slug === slug ? state.provider : null
  const providerName = loadedProvider?.displayName || 'Service provider'
  const categoryName = loadedProvider?.category?.name
  const blockName = loadedProvider?.block?.name

  usePageMeta({
    title: loadedProvider ? (categoryName ? `${providerName} · ${categoryName}` : providerName) : 'Service provider',
    description:
      loadedProvider?.bio ||
      (loadedProvider
        ? `Book ${providerName} for ${categoryName || 'local'} services${blockName ? ` in ${blockName}` : ''}. See starting prices and request a time slot on CityCart.`
        : undefined),
    image: loadedProvider?.coverImage || loadedProvider?.avatar || undefined,
    noindex: state.loaded && state.slug === slug && !state.provider,
    jsonLd: loadedProvider
      ? [
          serviceLd({ provider: loadedProvider, path: `/services/${slug}` }),
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Services', path: '/services' },
            { name: providerName, path: `/services/${slug}` },
          ]),
        ]
      : null,
  })

  if (!state.loaded || state.slug !== slug) {
    return (
      <div className="bg-canvas">
        <div className={`${shell} pb-16 pt-6 sm:pt-8`}>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-5 h-[230px] w-full rounded-panel sm:h-[300px]" />
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem] lg:gap-10">
            <div className="space-y-4">
              <Skeleton className="h-24 w-full rounded-card" />
              <Skeleton className="h-24 w-full rounded-card" />
            </div>
            <Skeleton className="h-80 w-full rounded-panel" />
          </div>
        </div>
      </div>
    )
  }

  if (!state.provider) {
    return (
      <div className="bg-canvas">
        <div className={`${shell} py-16`}>
          <EmptyState
            icon={Wrench}
            title="Provider not found"
            message={state.error || 'This provider page is not available.'}
            action={
              <Link to="/services" className={btn('noir', 'md')}>
                Browse services
              </Link>
            }
          />
        </div>
      </div>
    )
  }

  const provider = state.provider
  const block = provider.block

  return (
    <div className="bg-canvas">
      <div className={`${shell} pb-16 pt-6 sm:pt-8`}>
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink/45">
          <Link to="/" className="transition hover:text-ink">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <Link to="/services" className="transition hover:text-ink">
            Services
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span className="max-w-48 truncate text-ink/70">{provider.displayName}</span>
        </nav>

        <section className="relative mt-5 overflow-hidden rounded-panel bg-sand">
          <div className="relative h-[230px] bg-noir-soft sm:h-[300px]">
            {provider.coverImage && (
              <ProductImage src={provider.coverImage} name={provider.displayName} className="h-full w-full" width={1600} />
            )}
            <div
              aria-hidden="true"
              className={`absolute inset-0 ${
                provider.coverImage
                  ? 'bg-gradient-to-t from-noir/90 via-noir/55 to-noir/5'
                  : 'bg-[radial-gradient(120%_120%_at_18%_0%,rgba(28,58,46,0.95),#15140f_72%)]'
              }`}
            />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end gap-4 p-5 sm:p-8">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-card border border-white/25 bg-cream/95 shadow-lg sm:h-20 sm:w-20">
                <ProductImage src={provider.avatar} name={provider.displayName} className="h-full w-full text-lg" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cream/60">
                  {provider.category?.name || 'Local services'}
                </p>
                <h1 className="font-display mt-1.5 text-[30px] font-semibold leading-tight tracking-[-0.02em] text-cream sm:text-[40px]">
                  {provider.displayName}
                </h1>
                <p className="mt-1.5 inline-flex flex-wrap items-center gap-x-2 text-[12.5px] text-cream/70">
                  {block?.name && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-clay" aria-hidden="true" />
                      Serves {block.name}
                    </span>
                  )}
                  {provider.city?.name && <span>· {provider.city.name}</span>}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-warm bg-paper-warm px-5 py-4 sm:px-8">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-ink/55">
              {provider.ratingCount > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Stars value={provider.ratingAvg} />
                  <span className="font-semibold text-ink">{provider.ratingAvg.toFixed(1)}</span>
                  <span>
                    ({provider.ratingCount} {provider.ratingCount === 1 ? 'review' : 'reviews'})
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-clay">
                  <Star className="h-4 w-4" aria-hidden="true" />
                  {provider.isNew ? 'New on CityCart' : 'No reviews yet'}
                </span>
              )}
              <span>
                {provider.completedBookings} completed {provider.completedBookings === 1 ? 'job' : 'jobs'}
              </span>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/40">Starting at</p>
              <p className="font-display mt-0.5 text-[22px] font-semibold text-ink">{formatPrice(provider.startingAtPrice / 100)}</p>
            </div>
          </div>
        </section>

        {provider.bio && (
          <p className="mt-6 max-w-3xl text-[14px] leading-relaxed text-ink/65">{provider.bio}</p>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem] lg:gap-10">
          <div className="min-w-0">
            <section>
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line-warm pb-4">
                <div>
                  <p className={sectionLabel}>What they do</p>
                  <h2 className={sectionTitle}>Services</h2>
                </div>
                {provider.offerings.length > 0 && (
                  <p className="text-[12px] text-muted">
                    {provider.offerings.length} {provider.offerings.length === 1 ? 'service' : 'services'}
                  </p>
                )}
              </div>
              {provider.offerings.length === 0 ? (
                <p className={`${card} mt-5 p-6 text-[13px] leading-relaxed text-ink/60`}>
                  This provider has not published a service list yet. Their starting price is shown above.
                </p>
              ) : (
                <ul className="mt-5 space-y-4">
                  {provider.offerings.map((offering) => (
                    <li key={offering._id} className={`${card} flex flex-wrap gap-4 p-5`}>
                      <ProductImage
                        src={offering.images?.[0]}
                        name={offering.title}
                        className="size-20 shrink-0 rounded-tile text-base"
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-[17px] font-semibold tracking-tight text-ink">{offering.title}</h3>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink/55">
                          <span className="font-semibold text-ink">{formatPrice(offering.startingAtPrice / 100)}</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5 text-clay/70" aria-hidden="true" />
                            {durationLabel(offering.durationMinutes)}
                          </span>
                        </p>
                        {offering.description && (
                          <p className="mt-2 text-[13px] leading-relaxed text-ink/60">{offering.description}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-5 flex items-start gap-2.5 rounded-panel border border-clay/15 bg-cream/60 px-4 py-3.5 text-[12.5px] leading-relaxed text-ink/60">
                <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-clay" aria-hidden="true" />
                Prices are starting points. Agree the final scope and price with {provider.displayName} before the job.
              </p>
            </section>

            <section className="mt-10">
              <div className="border-b border-line-warm pb-4">
                <p className={sectionLabel}>When they work</p>
                <h2 className={sectionTitle}>Working hours</h2>
              </div>
              {provider.availability?.isPublished ? (
                <div className={`${card} mt-5 p-5`}>
                  <dl className="space-y-2 text-[13px]">
                    {provider.availability.windows.map((window) => (
                      <div key={`${window.weekday}-${window.startMinute}`} className="flex justify-between gap-4">
                        <dt className="text-ink/55">{window.weekdayName}</dt>
                        <dd className="font-medium text-ink">
                          {minuteLabel(window.startMinute)} – {minuteLabel(window.endMinute)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {provider.availability.blackoutDates.length > 0 && (
                    <p className="mt-4 border-t border-line-warm pt-3 text-[12.5px] leading-relaxed text-ink/55">
                      Not available on {provider.availability.blackoutDates.map(formatKarachiDate).join(', ')}.
                    </p>
                  )}
                </div>
              ) : (
                <p className={`${card} mt-5 p-5 text-[13px] leading-relaxed text-ink/60`}>
                  No fixed working hours published. Request any future time and {provider.displayName} will confirm the slot.
                </p>
              )}
            </section>

            <section className="mt-10">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line-warm pb-4">
                <div>
                  <p className={sectionLabel}>Neighbours' verdict</p>
                  <h2 className={sectionTitle}>Reviews</h2>
                </div>
                {provider.ratingCount > 0 && (
                  <p className="inline-flex items-center gap-1.5 text-[12px] text-ink/55">
                    <Star className="h-3.5 w-3.5 fill-clay text-clay" aria-hidden="true" />
                    {provider.ratingAvg.toFixed(1)} from {provider.ratingCount}
                  </p>
                )}
              </div>
              {provider.reviews?.length > 0 ? (
                <ul className="mt-5 space-y-3">
                  {provider.reviews.map((review) => (
                    <li key={review._id} className={`${card} p-5`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Stars value={review.rating} />
                        <span className="text-[11.5px] text-ink/50">
                          {review.reviewerName} · {formatKarachiDate(review.createdAt)}
                        </span>
                      </div>
                      {review.serviceTitle && (
                        <p className="mt-1.5 text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink/45">{review.serviceTitle}</p>
                      )}
                      {review.comment && (
                        <p className="mt-2 text-[13.5px] leading-relaxed text-ink/70">{review.comment}</p>
                      )}
                      {review.providerReply?.body && (
                        <div className="mt-3 rounded-tile bg-canvas px-3.5 py-2.5 text-[13px] leading-relaxed text-ink/60">
                          <span className="font-semibold text-ink">{provider.displayName} replied: </span>
                          {review.providerReply.body}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={`${card} mt-5 p-5 text-[13px] text-ink/60`}>
                  No reviews yet. Only customers with a confirmed booking can review.
                </p>
              )}
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {(!user || user.role === 'CUSTOMER') && (
              <section className={`${panel} p-5`}>
                <p className={sectionLabel}>Not ready to book?</p>
                <h2 className="font-display mt-2 text-[20px] font-semibold tracking-tight text-ink">Ask a question</h2>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink/55">
                  Chat with {provider.displayName} about the job first. Prices and times are still agreed in a booking.
                </p>
                <Link
                  to={`/chat?provider=${provider._id}&tab=providers`}
                  className={`${btn('outline', 'md')} mt-4 w-full`}
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Message {provider.displayName}
                </Link>
              </section>
            )}

            <section className={`${panel} p-5`}>
              <p className={sectionLabel}>Book this provider</p>
              <h2 className="font-display mt-2 text-[20px] font-semibold tracking-tight text-ink">Request a booking</h2>
              <BookingRequest provider={provider} />
            </section>

            <section className={`${panel} p-5`}>
              <p className={sectionLabel}>Where they work</p>
              <h2 className="font-display mt-2 text-[20px] font-semibold tracking-tight text-ink">Service area</h2>
              <p className="mt-2 font-medium text-ink">
                {[block?.name, provider.city?.name].filter(Boolean).join(', ') || 'Not set'}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink/55">
                The exact address is shared once a booking is accepted. The map shows the block centre.
              </p>
              {block?.center && (
                <div className="mt-4 overflow-hidden rounded-tile border border-line-warm">
                  <Suspense fallback={<Skeleton className="h-52 w-full rounded-none" />}>
                    <ServicesMap items={[provider]} />
                  </Suspense>
                </div>
              )}
            </section>

            <Link to="/services" className={`${btn('outline', 'md')} w-full`}>
              Browse more providers
            </Link>
          </aside>
        </div>
      </div>
    </div>
  )
}
