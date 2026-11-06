import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LayoutList, LocateFixed, Map as MapIcon, MapPin, Search, Star, Wrench } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import { useCity } from '../hooks/useCity'
import { useNearby } from '../hooks/useNearby'
import { isRadius } from '../utils/range'
import RangeSelector from '../components/nearby/RangeSelector'
import ProductImage from '../components/ProductImage'
import { selectClass } from '../components/brand/Bits'
import { EmptyState, Skeleton } from '../components/ui'
import { formatDistance } from '../utils/geo'
import { btnDark, btnOutline, card, formatPrice, inputClass, wrap } from '../ui'

const ServicesMap = lazy(() => import('../components/services/ServicesMap'))

const SORTS = [
  ['rank', 'Recommended'],
  ['rating', 'Top rated'],
  ['price', 'Lowest starting price'],
]

const NEXT_RADIUS = [2, 5, 10, 20, 50]
const rangeLabel = (range) => (range === 'city' ? 'the whole city' : isRadius(range) ? `${range} km` : 'your block')

function nextRange(range) {
  if (range === 'block') return '5'
  if (isRadius(range)) {
    const bigger = NEXT_RADIUS.find((km) => km > Number(range))
    return bigger ? String(bigger) : 'city'
  }
  return null
}

function ProviderCard({ provider }) {
  return (
    <article className={`${card} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <ProductImage
            src={provider.avatar || provider.coverImage}
            name={provider.displayName}
            className="size-14 shrink-0 rounded-md text-sm"
          />
          <div className="min-w-0">
            <Link
              to={`/services/${provider.slug}`}
              className="block truncate font-display text-lg font-semibold tracking-tight text-ink hover:text-pine"
            >
              {provider.displayName}
            </Link>
            <p className="text-[12.5px] text-muted">
              {provider.category?.name}
              {provider.block?.name && <> · {provider.block.name}</>}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12.5px] text-muted">
              {provider.ratingCount > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-clay text-clay" aria-hidden="true" />
                  {provider.ratingAvg.toFixed(1)}
                  <span className="text-muted/80">({provider.ratingCount})</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-clay">
                  <Star className="h-3.5 w-3.5" aria-hidden="true" />
                  {provider.isNew ? 'New on CityCart' : 'No reviews yet'}
                </span>
              )}
              {provider.distanceKm !== null && provider.distanceKm !== undefined && (
                <span>{formatDistance(provider.distanceKm)} away</span>
              )}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Starting at</p>
          <p className="text-[15px] font-semibold text-ink">{formatPrice(provider.startingAtPrice / 100)}</p>
          <Link to={`/services/${provider.slug}`} className="mt-1 inline-block text-[13px] font-medium text-clay hover:underline">
            View services
          </Link>
        </div>
      </div>

      {provider.bio && <p className="mt-3 line-clamp-2 text-[13px] text-muted">{provider.bio}</p>}

      {provider.topOfferings?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
          {provider.topOfferings.map((offering) => (
            <Link
              key={offering._id}
              to={`/services/${provider.slug}`}
              className="rounded-full border border-line bg-paper px-3 py-1 text-[12px] text-ink/80 transition hover:border-ink hover:text-ink"
            >
              {offering.title}
            </Link>
          ))}
          {provider.offeringCount > provider.topOfferings.length && (
            <span className="px-1 py-1 text-[12px] text-muted">
              +{provider.offeringCount - provider.topOfferings.length} more
            </span>
          )}
        </div>
      )}
    </article>
  )
}

function ResultsSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-40 w-full rounded-lg" />
      ))}
    </div>
  )
}

export default function Services() {
  const navigate = useNavigate()
  const { city, cityId } = useCity()
  const { selectedBlocks, blockIds, areaName, coords, origin, range, setRange, blocksReady, detect, status } = useNearby()
  const [view, setView] = useState('list')
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [sort, setSort] = useState('rank')
  const [categories, setCategories] = useState([])

  useEffect(() => {
    let active = true
    api
      .get('/services/categories')
      .then((res) => active && setCategories(res.data.categories || []))
      .catch(() => active && setCategories([]))
    return () => {
      active = false
    }
  }, [])

  // Same scope logic as the shopper's shop discovery: chosen block(s), a radius
  // around the shopper, or the whole city.
  const hasArea = blockIds.length > 0
  const hasLocation = hasArea || Boolean(coords)
  const needsArea = range === 'block' && !hasArea
  const radiusApplied = isRadius(range) && Boolean(origin)

  const filterKey = JSON.stringify([cityId, blockIds, coords, range, q, categoryId, sort])
  const [pageState, setPageState] = useState({ filterKey, page: 1 })
  const currentPage = pageState.filterKey === filterKey ? pageState.page : 1
  const setPageForFilters = (next) => setPageState({ filterKey, page: next })

  const query = useMemo(() => {
    if (!cityId || !blocksReady) return null
    const base = {
      page: currentPage,
      sort,
      ...(q && { q }),
      ...(categoryId && { categoryId }),
    }
    if (hasArea && range !== 'city') {
      return {
        ...base,
        scope: 'area',
        blockIds: blockIds.join(','),
        ...(origin && { lat: origin.lat, lng: origin.lng }),
        ...(isRadius(range) && origin && { radiusKm: range }),
      }
    }
    if (isRadius(range) && coords) {
      return { ...base, scope: 'radius', radiusKm: range, lat: coords.lat, lng: coords.lng }
    }
    return { ...base, cityId, scope: 'city', ...(coords && { lat: coords.lat, lng: coords.lng }) }
  }, [cityId, blocksReady, currentPage, sort, q, categoryId, hasArea, range, blockIds, origin, coords])

  const key = JSON.stringify(query)
  const [result, setResult] = useState({ key: '', data: null, error: '' })
  useEffect(() => {
    if (!query) return undefined
    let active = true
    api
      .get('/services/discover', { params: query })
      .then((res) => active && setResult({ key, data: res.data, error: '' }))
      .catch((err) => active && setResult({ key, data: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [key, query])

  const loading = Boolean(query) && result.key !== key
  const data = result.key === key ? result.data : null
  const error = result.key === key ? result.error : ''
  const items = data?.items || []
  const bigger = nextRange(range)

  function onSearch(e) {
    e.preventDefault()
    setQ(draft.trim())
  }

  return (
    <div className={`${wrap} py-8 sm:py-10`}>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[30px]">Services near you</h1>
        <p className="mt-1.5 text-[13.5px] text-muted">
          Cleaning, repairs, beauty and more — book a local provider in your block. Agree the details and the final
          price directly with them.
        </p>
      </header>

      <form onSubmit={onSearch} role="search" className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <label htmlFor="services-search" className="sr-only">
            Search a service or provider
          </label>
          <input
            id="services-search"
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search a service or provider…"
            className={`h-11 pl-10 ${inputClass}`}
          />
        </div>
        <button type="submit" className={btnDark}>
          Search
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <label htmlFor="service-category" className="sr-only">
          Category
        </label>
        <select
          id="service-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={selectClass}
        >
          <option value="">All services</option>
          {categories.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
        <label htmlFor="service-sort" className="sr-only">
          Sort
        </label>
        <select id="service-sort" value={sort} onChange={(e) => setSort(e.target.value)} className={selectClass}>
          {SORTS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <button type="button" onClick={detect} disabled={status === 'detecting'} className={`${btnOutline} h-9`}>
          <LocateFixed className={`h-4 w-4 ${status === 'detecting' ? 'animate-spin' : ''}`} aria-hidden="true" />
          {status === 'detecting' ? 'Finding you…' : hasLocation ? 'Update my location' : 'Use my location'}
        </button>
        <p className="text-[13px] text-muted">
          {areaName ? `Looking in ${areaName}` : city ? city.name : 'Location not set'}
        </p>
        <RangeSelector />
      </div>

      {needsArea && cityId && (
        <p className="mt-4 rounded-md bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
          Choose your area to search only your block. Showing the whole city for now.
        </p>
      )}

      {(cityId || view === 'map') && (
        <div className="mt-6 flex justify-end">
          <div role="group" aria-label="Results view" className="inline-flex overflow-hidden rounded-md border border-line bg-white text-[13px] font-medium">
            {[
              ['list', 'List', LayoutList],
              ['map', 'Map', MapIcon],
            ].map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={`inline-flex h-9 items-center gap-1.5 px-3.5 transition ${view === value ? 'bg-ink text-white' : 'text-ink/70 hover:text-ink'}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <section className="mt-4" aria-live="polite">
        {view === 'map' ? (
          <div>
            <Suspense fallback={<Skeleton className="h-[460px] w-full rounded-lg" />}>
              <ServicesMap
                items={items}
                zones={selectedBlocks}
                origin={origin}
                radiusKm={isRadius(range) && origin ? Number(range) : null}
                originLabel={coords ? 'Your spot' : selectedBlocks.length === 1 ? `Centre of ${areaName}` : 'Search centre'}
                onOpenProvider={(provider) => navigate(`/services/${provider.slug}`)}
              />
            </Suspense>
            {data?.pagination?.pages > 1 && <p className="mt-2 text-xs text-muted">The map shows the providers on this page of results.</p>}
          </div>
        ) : !cityId ? (
          <EmptyState
            icon={MapPin}
            title="Where should we look?"
            message="Share your location so we can show the service providers in your area."
            className="rounded-lg border border-dashed border-line bg-white"
            action={
              <button type="button" onClick={detect} disabled={status === 'detecting'} className={btnDark}>
                <LocateFixed className="h-4 w-4" aria-hidden="true" />
                Use my location
              </button>
            }
          />
        ) : loading || !query ? (
          <ResultsSkeleton />
        ) : error ? (
          <p className="text-clay">{error}</p>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title={q ? `No services for “${q}” within ${rangeLabel(range)}` : `No service providers within ${rangeLabel(range)} yet`}
            message={
              range === 'city'
                ? `Nothing matched in ${city?.name || 'this city'}. Try a different search or category.`
                : 'Try a wider range to see more providers.'
            }
            className="rounded-lg border border-dashed border-line bg-white"
            action={
              bigger && (
                <button type="button" onClick={() => setRange(bigger)} className={btnDark}>
                  {bigger === 'city' ? 'Search the whole city' : `Try ${bigger} km`}
                </button>
              )
            }
          />
        ) : (
          <>
            <p className="mb-4 text-[13px] text-muted">
              {data.pagination.total} {data.pagination.total === 1 ? 'provider' : 'providers'} with{' '}
              {data.meta.totalOfferings} {data.meta.totalOfferings === 1 ? 'service' : 'services'}
              {q && <> for “{q}”</>}
              {isRadius(range) && radiusApplied && <> within {rangeLabel(range)}</>}
              {areaName && range !== 'block' && <> around {areaName}</>}
            </p>
            <div className="space-y-4">
              {items.map((provider) => (
                <ProviderCard key={provider._id} provider={provider} />
              ))}
            </div>
            {data.pagination.pages > 1 && (
              <div className="mt-7 flex items-center justify-between text-sm">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPageForFilters(currentPage - 1)}
                  className={`${btnOutline} h-9 px-4`}
                >
                  Previous
                </button>
                <span className="text-muted">
                  Page {data.pagination.page} of {data.pagination.pages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= data.pagination.pages}
                  onClick={() => setPageForFilters(currentPage + 1)}
                  className={`${btnOutline} h-9 px-4`}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
