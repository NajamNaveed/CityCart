import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Search, SearchX, Store } from 'lucide-react'
import { useCity } from '../hooks/useCity'
import { useBrands } from '../hooks/useBrands'
import { EmptyState, Reveal, Skeleton } from '../components/ui'
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
  const { city, cityId } = useCity()
  const { brands, loading } = useBrands(cityId)
  const [query, setQuery] = useState('')

  const filtered = brands.filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <div className={`${wrap} py-10`}>
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
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            id="brand-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search brands…"
            className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-3.5 text-[13.5px] text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-ink/10"
          />
        </div>
      </div>

      <div className="mt-10">
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i}>
                <Skeleton className="h-44 w-full rounded-xl" />
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
                <Link
                  to={`/shop?brandId=${brand._id}`}
                  className="group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm shadow-ink/5 transition-all duration-300 hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-lg hover:shadow-ink/5"
                >
                  <div className="relative flex h-44 items-center justify-center bg-gradient-to-br from-cream via-sand to-paper">
                    <div aria-hidden="true" className="absolute h-32 w-32 rounded-full bg-white/40 blur-2xl" />
                    {brand.logo ? (
                      <img src={brand.logo} alt="" className="relative max-h-20 max-w-[65%] object-contain" />
                    ) : (
                      <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white font-display text-[22px] font-semibold text-clay shadow-md shadow-ink/10">
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
                </Link>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
