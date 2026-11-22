import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Search, SearchX, Store } from 'lucide-react'
import { useCity } from '../hooks/useCity'
import { useBrands } from '../hooks/useBrands'
import { usePageMeta } from '../hooks/usePageMeta'
import { Aurora, EmptyState, Reveal, Skeleton, Spotlight } from '../components/ui'
import { sectionLabel, wrap } from '../ui'

function monogram(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export default function Brands() {
  usePageMeta({
    title: 'Local brands',
    description: 'Independent brands selling through CityCart, city by city. Find a storefront and shop its shelf.',
  })

  const { city, cityId } = useCity()
  const { brands, loading } = useBrands(cityId)
  const [query, setQuery] = useState('')

  const filtered = brands.filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <div className="relative overflow-hidden">
      <Aurora tone="warm" intensity={0.4} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent"
      />

      <div className={`relative ${wrap} py-10`}>
        <p className={sectionLabel}>Marketplace</p>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {city ? `Brands in ${city.name}` : 'All brands'}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {loading ? 'Loading brands…' : `${filtered.length} ${filtered.length === 1 ? 'brand' : 'brands'} on CityCart`}
          {city ? ` · selling in ${city.name}` : ' · selling in every city'}
        </p>

        <div className="mt-8 max-w-md">
          <label htmlFor="brand-search" className="sr-only">
            Search brands
          </label>
          <div className="group/search relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted transition-colors group-focus-within/search:text-clay"
              aria-hidden="true"
            />
            <input
              id="brand-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search brands…"
              className="h-11 w-full rounded-full border border-line bg-white pl-10 pr-4 text-[13.5px] text-ink shadow-[0_14px_34px_-26px_rgba(21,20,15,0.5)] outline-none transition focus:border-gold/60 focus:ring-2 focus:ring-gold/15"
            />
          </div>
        </div>

        <div className="mt-10">
          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i}>
                  <Skeleton className="h-44 w-full rounded-2xl" />
                  <Skeleton className="mt-3 h-4 w-1/2" />
                  <Skeleton className="mt-2 h-3.5 w-3/4" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={query ? SearchX : Store}
              title={query ? `No brands match “${query}”.` : 'No brands are selling here yet.'}
              message={query ? 'Try a shorter or different search.' : 'Check back soon, or switch to another city.'}
              className="py-20"
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((brand, i) => (
                <Reveal key={brand._id} delay={Math.min(i, 8) * 0.04} className="h-full">
                  <Spotlight
                    as={Link}
                    to={`/nearby?q=${encodeURIComponent(brand.name)}`}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line-warm bg-paper-warm transition-all duration-500 hover:-translate-y-1.5 hover:border-gold/50 hover:shadow-[0_34px_64px_-34px_rgba(21,20,15,0.45)]"
                  >
                    <div className="relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br from-cream via-sand to-paper">
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                      />
                      <div
                        aria-hidden="true"
                        className="absolute h-36 w-36 rounded-full bg-white/50 blur-2xl transition-transform duration-700 group-hover:scale-125"
                      />
                      {brand.logo ? (
                        <img
                          src={brand.logo}
                          alt=""
                          className="relative max-h-20 max-w-[62%] object-contain transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-noir to-forest-deep font-display text-[22px] font-semibold text-cream shadow-[0_16px_34px_-16px_rgba(21,20,15,0.6)] ring-4 ring-white/60">
                          {monogram(brand.name)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="truncate text-[15px] font-semibold text-ink">{brand.name}</p>
                      {brand.description && (
                        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted">{brand.description}</p>
                      )}
                      <p className="mt-auto inline-flex items-center gap-1.5 pt-3 text-[12.5px] font-medium text-clay">
                        Visit brand
                        <ArrowUpRight
                          className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                          aria-hidden="true"
                        />
                      </p>
                    </div>
                  </Spotlight>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
