import { Link } from 'react-router-dom'
import { ArrowUpRight, MapPin, Star } from 'lucide-react'
import ProductImage from '../ProductImage'
import Spotlight from '../ui/Spotlight'
import { formatPrice } from '../../ui'
import { formatDistance } from '../../utils/geo'

/**
 * A pro on the home page: the cover leads, the name sits on it, and the only
 * prices shown are the ones the server published as starting points.
 */
export default function ProviderCard({ provider }) {
  const url = `/services/${provider.slug}`
  const distance = formatDistance(provider.distanceKm)
  const offerings = Array.isArray(provider.topOfferings) ? provider.topOfferings.slice(0, 2) : []
  const rating = provider.ratingCount > 0
  const where = [provider.category?.name, provider.block?.name].filter(Boolean).join(' · ')

  return (
    <Spotlight
      as="article"
      className="group relative flex h-full flex-col overflow-hidden rounded-[20px] border border-line-warm bg-paper-warm transition-all duration-500 hover:-translate-y-1.5 hover:border-gold/50 hover:shadow-[0_34px_64px_-34px_rgba(21,20,15,0.5)]"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 top-0 z-10 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
      />
      <Link to={url} tabIndex={-1} aria-hidden="true" className="img-zoom relative block overflow-hidden bg-sand">
        <ProductImage
          src={provider.coverImage || provider.avatar}
          name={provider.displayName}
          className="aspect-[16/10] w-full"
          width={800}
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-noir/90 via-noir/25 to-noir/5"
        />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/20 bg-noir/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-cream backdrop-blur-md">
          {rating ? (
            <>
              <Star className="h-3 w-3 fill-gold text-gold" aria-hidden="true" />
              {provider.ratingAvg.toFixed(1)}
              <span className="font-normal text-cream/60">({provider.ratingCount})</span>
            </>
          ) : (
            'New on CityCart'
          )}
        </span>
        {provider.acceptingNewOrders && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-cream/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-forest">
            <span aria-hidden="true" className="pulse-dot h-1.5 w-1.5 rounded-full bg-forest text-forest" />
            Booking
          </span>
        )}
        <div className="absolute inset-x-3.5 bottom-3.5 flex items-center gap-2.5">
          {provider.avatar && (
            <img
              src={provider.avatar}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full border-2 border-cream/80 object-cover shadow-[0_4px_12px_rgba(21,20,15,0.4)]"
              loading="lazy"
            />
          )}
          <div className="min-w-0">
            <h3 className="truncate font-display text-[19px] font-semibold leading-tight tracking-tight text-cream">
              {provider.displayName}
            </h3>
            {where && <p className="mt-0.5 truncate text-[11px] text-cream/65">{where}</p>}
          </div>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink/60">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-clay/80" aria-hidden="true" />
            {distance || provider.block?.name || 'On your block'}
          </span>
          {provider.acceptingNewOrders ? (
            <span className="text-forest/80">Accepting new work</span>
          ) : (
            <span className="text-muted">Fully booked</span>
          )}
        </p>

        {offerings.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {offerings.map((offering) => (
              <span
                key={offering._id}
                className="rounded-full border border-line-warm bg-cream px-2.5 py-1 text-[10.5px] text-ink/70"
              >
                {offering.title}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-line-warm pt-3.5">
          <p>
            <span className="block text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink/40">
              From
            </span>
            <span className="font-display text-[16px] font-semibold text-ink">
              {formatPrice(provider.startingAtPrice / 100)}
            </span>
          </p>
          <Link
            to={url}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-br from-noir to-forest-deep px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-cream shadow-[0_12px_24px_-14px_rgba(21,20,15,0.9)] transition hover:brightness-110"
          >
            Book
            <ArrowUpRight
              className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>
    </Spotlight>
  )
}
