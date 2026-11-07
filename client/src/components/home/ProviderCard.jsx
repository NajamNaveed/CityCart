import { Link } from 'react-router-dom'
import { ArrowUpRight, MapPin, Star } from 'lucide-react'
import ProductImage from '../ProductImage'
import { formatPrice } from '../../ui'
import { card, cardLift } from '../../design'
import { formatDistance } from '../../utils/geo'

export default function ProviderCard({ provider }) {
  const url = `/services/${provider.slug}`
  const distance = formatDistance(provider.distanceKm)
  const offerings = Array.isArray(provider.topOfferings) ? provider.topOfferings : []
  const rating = provider.ratingCount > 0

  return (
    <article className={`group flex h-full flex-col overflow-hidden ${card} ${cardLift}`}>
      <Link to={url} tabIndex={-1} aria-hidden="true" className="relative block overflow-hidden bg-sand">
        <ProductImage
          src={provider.coverImage || provider.avatar}
          name={provider.displayName}
          className="aspect-[16/10] w-full"
          width={800}
        />
        <span className="absolute left-3 top-3 rounded-full bg-cream/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-noir backdrop-blur-sm">
          {rating ? `${provider.ratingAvg.toFixed(1)} rated` : 'New on CityCart'}
        </span>
        {provider.acceptingNewOrders && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-noir/90 px-2.5 py-1 text-[10px] font-medium text-cream backdrop-blur-sm">
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-sage" />
            Booking
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          {provider.avatar ? (
            <img
              src={provider.avatar}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full border border-line-warm object-cover"
              loading="lazy"
            />
          ) : null}
          <div className="min-w-0">
            <h3 className="truncate font-display text-[19px] font-semibold leading-tight tracking-tight text-ink">
              <Link to={url} className="transition-colors hover:text-clay">
                {provider.displayName}
              </Link>
            </h3>
            <p className="mt-0.5 truncate text-[11.5px] text-muted">
              {[provider.category?.name, provider.block?.name].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink/60">
          {rating ? (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-clay text-clay" aria-hidden="true" />
              <b className="font-semibold text-ink/80">{provider.ratingAvg.toFixed(1)}</b>
              <span className="text-muted">({provider.ratingCount})</span>
            </span>
          ) : (
            <span>No reviews yet</span>
          )}
          {(distance || provider.block?.name) && (
            <span className="inline-flex items-center gap-1 text-muted">
              <MapPin className="h-3 w-3 text-clay" aria-hidden="true" />
              {distance || provider.block?.name}
            </span>
          )}
        </p>

        {offerings.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {offerings.slice(0, 2).map((offering) => (
              <span
                key={offering._id}
                className="rounded-full border border-line-warm bg-canvas px-2.5 py-1 text-[10.5px] text-ink/65"
              >
                {offering.title}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-line-warm pt-3.5">
          <p>
            <span className="block text-[9.5px] font-medium uppercase tracking-[0.16em] text-muted">Starting at</span>
            <span className="text-[14px] font-semibold text-ink">{formatPrice(provider.startingAtPrice / 100)}</span>
          </p>
          <Link
            to={url}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-noir px-3.5 text-[11px] font-medium uppercase tracking-[0.08em] text-cream transition-colors hover:bg-noir-soft"
          >
            Book
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  )
}
