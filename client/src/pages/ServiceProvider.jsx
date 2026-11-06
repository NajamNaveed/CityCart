import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Clock3, MapPin, Star, Wrench } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import ProductImage from '../components/ProductImage'
import Stars from '../components/Stars'
import BookingRequest from '../components/services/BookingRequest'
import { EmptyState, Skeleton } from '../components/ui'
import { formatKarachiDate, minuteLabel } from '../utils/serviceSlots'
import { btnDark, btnOutline, card, formatPrice, wrap } from '../ui'

const ServicesMap = lazy(() => import('../components/services/ServicesMap'))

function durationLabel(minutes) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

export default function ServiceProvider() {
  const { slug } = useParams()
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

  if (!state.loaded || state.slug !== slug) {
    return (
      <div className={`${wrap} py-8 sm:py-10`}>
        <Skeleton className="h-56 w-full rounded-lg" />
        <Skeleton className="mt-6 h-10 w-72" />
        <Skeleton className="mt-6 h-52 w-full rounded-lg" />
      </div>
    )
  }

  if (!state.provider) {
    return (
      <div className={`${wrap} py-16`}>
        <EmptyState
          icon={Wrench}
          title="Provider not found"
          message={state.error || 'This provider page is not available.'}
          className="rounded-lg border border-dashed border-line bg-white"
          action={
            <Link to="/services" className={btnDark}>
              Browse services
            </Link>
          }
        />
      </div>
    )
  }

  const provider = state.provider
  const block = provider.block

  return (
    <div className={`${wrap} py-8 sm:py-10`}>
      <Link to="/services" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        All services
      </Link>

      <section className="overflow-hidden rounded-lg border border-line bg-white">
        <div className="relative h-40 bg-pine sm:h-52">
          {provider.coverImage && (
            <img src={provider.coverImage} alt="" className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/45 to-transparent" aria-hidden="true" />
        </div>
        <div className="px-5 pb-6 sm:px-7">
          <div className="-mt-9 flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-0 items-end gap-4">
              <ProductImage
                src={provider.avatar}
                name={provider.displayName}
                className="size-20 shrink-0 rounded-lg border-2 border-white text-xl shadow-sm"
              />
              <div className="min-w-0 pb-1">
                <h1 className="truncate font-display text-2xl font-semibold tracking-tight text-ink sm:text-[30px]">
                  {provider.displayName}
                </h1>
                <p className="text-[13px] text-muted">
                  {provider.category?.name}
                  {block?.name && <> · {block.name}</>}
                  {provider.city?.name && <> · {provider.city.name}</>}
                </p>
              </div>
            </div>
            <div className="pb-1 text-right">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Starting at</p>
              <p className="text-xl font-semibold text-ink">{formatPrice(provider.startingAtPrice / 100)}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted">
            {provider.ratingCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <Stars value={provider.ratingAvg} />
                <span className="font-medium text-ink">{provider.ratingAvg.toFixed(1)}</span>
                <span>({provider.ratingCount} {provider.ratingCount === 1 ? 'review' : 'reviews'})</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-clay">
                <Star className="h-4 w-4" aria-hidden="true" />
                {provider.isNew ? 'New on CityCart' : 'No reviews yet'}
              </span>
            )}
            <span>{provider.completedBookings} completed {provider.completedBookings === 1 ? 'job' : 'jobs'}</span>
            {block?.name && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                Serves {block.name}
              </span>
            )}
          </div>

          {provider.bio && <p className="mt-4 max-w-3xl text-[14px] leading-relaxed text-ink/80">{provider.bio}</p>}
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Services</h2>
          {provider.offerings.length === 0 ? (
            <p className={`${card} mt-3 p-6 text-sm text-muted`}>
              This provider has not published a service list yet. Their starting price is shown above.
            </p>
          ) : (
            <ul className="mt-3 space-y-4">
              {provider.offerings.map((offering) => (
                <li key={offering._id} className={`${card} flex flex-wrap gap-4 p-5`}>
                  <ProductImage
                    src={offering.images?.[0]}
                    name={offering.title}
                    className="size-20 shrink-0 rounded-md text-base"
                  />
                  <div className="min-w-0 flex-1 basis-52">
                    <h3 className="font-medium text-ink">{offering.title}</h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12.5px] text-muted">
                      <span className="font-medium text-ink">{formatPrice(offering.startingAtPrice / 100)}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                        {durationLabel(offering.durationMinutes)}
                      </span>
                    </p>
                    {offering.description && (
                      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{offering.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-6 rounded-md bg-paper px-4 py-3 text-[13px] leading-relaxed text-muted">
            Prices are starting points. Agree the final scope and price with {provider.displayName} before the job.
          </p>

          <section className="mt-8">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Working hours</h2>
            {provider.availability?.isPublished ? (
              <div className={`${card} mt-3 p-5`}>
                <dl className="space-y-1.5 text-[13px]">
                  {provider.availability.windows.map((window) => (
                    <div key={`${window.weekday}-${window.startMinute}`} className="flex justify-between gap-4">
                      <dt className="text-muted">{window.weekdayName}</dt>
                      <dd className="text-ink">
                        {minuteLabel(window.startMinute)} – {minuteLabel(window.endMinute)}
                      </dd>
                    </div>
                  ))}
                </dl>
                {provider.availability.blackoutDates.length > 0 && (
                  <p className="mt-4 border-t border-line pt-3 text-[12.5px] leading-relaxed text-muted">
                    Not available on {provider.availability.blackoutDates.map(formatKarachiDate).join(', ')}.
                  </p>
                )}
              </div>
            ) : (
              <p className={`${card} mt-3 p-5 text-[13px] leading-relaxed text-muted`}>
                No fixed working hours published. Request any future time and {provider.displayName} will confirm the
                slot.
              </p>
            )}
          </section>

          <section className="mt-8">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Reviews</h2>
            {provider.reviews?.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {provider.reviews.map((review) => (
                  <li key={review._id} className={`${card} p-5`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Stars value={review.rating} />
                      <span className="text-[12px] text-muted">
                        {review.reviewerName} · {formatKarachiDate(review.createdAt)}
                      </span>
                    </div>
                    {review.serviceTitle && (
                      <p className="mt-1 text-[12px] font-medium text-muted">{review.serviceTitle}</p>
                    )}
                    {review.comment && (
                      <p className="mt-2 text-[13.5px] leading-relaxed text-ink/85">{review.comment}</p>
                    )}
                    {review.providerReply?.body && (
                      <div className="mt-3 rounded-md bg-paper px-3.5 py-2.5 text-[13px] leading-relaxed text-muted">
                        <span className="font-medium text-ink">{provider.displayName} replied: </span>
                        {review.providerReply.body}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`${card} mt-3 p-5 text-[13px] text-muted`}>
                No reviews yet. Only customers with a confirmed booking can review.
              </p>
            )}
          </section>
        </section>

        <aside className="space-y-4">
          <section className={`${card} p-5`}>
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Request a booking</h2>
            <BookingRequest provider={provider} />
          </section>

          <section className={`${card} p-5`}>
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Service area</h2>
            <p className="mt-2 font-medium text-ink">
              {[block?.name, provider.city?.name].filter(Boolean).join(', ') || 'Not set'}
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              The exact address is shared once a booking is accepted. The map shows the block centre.
            </p>
            {block?.center && (
              <div className="mt-4">
                <Suspense fallback={<Skeleton className="h-52 w-full rounded-lg" />}>
                  <ServicesMap items={[provider]} />
                </Suspense>
              </div>
            )}
          </section>

          <Link to="/services" className={`${btnOutline} w-full`}>
            Browse more providers
          </Link>
        </aside>
      </div>
    </div>
  )
}
