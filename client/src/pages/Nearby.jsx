import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LocateFixed, MapPin, Phone, Search, Store } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import { useCity } from '../hooks/useCity'
import { useNearby } from '../hooks/useNearby'
import { isRadius } from '../utils/range'
import LocationChip from '../components/nearby/LocationChip'
import RangeSelector from '../components/nearby/RangeSelector'
import ProductImage from '../components/ProductImage'
import { EmptyState, Skeleton } from '../components/ui'
import { formatDistance } from '../utils/geo'
import { btnDark, btnOutline, card, formatPrice, inputClass, wrap } from '../ui'

const NEXT_RADIUS = [2, 5, 10, 20, 50]

function nextRange(range) {
  if (range === 'block') return '5'
  if (isRadius(range)) {
    const bigger = NEXT_RADIUS.find((km) => km > Number(range))
    return bigger ? String(bigger) : 'city'
  }
  return null
}

const rangeLabel = (range) => (range === 'city' ? 'the whole city' : isRadius(range) ? `${range} km` : 'this block')

function ProductTile({ product }) {
  const soldOut = product.availability === 'OUT_OF_STOCK'
  return (
    <Link to={`/product/${product._id}`} className="group block min-w-0">
      <ProductImage src={product.image} name={product.name} width={300} className="aspect-square w-full rounded-md" />
      <p className="mt-2 truncate text-[13px] font-medium text-ink group-hover:underline">{product.name}</p>
      <p className="text-[12.5px] text-muted">
        {formatPrice(product.price)}
        {soldOut && <span className="ml-1.5 text-danger">Sold out</span>}
      </p>
    </Link>
  )
}

function BranchLine({ branch }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5 text-[13px]">
      <span className="min-w-0">
        <span className="block font-medium text-ink">{branch.name}</span>
        <span className="block text-muted">
          {[branch.blockName, branch.address].filter(Boolean).join(' · ')}
        </span>
        {branch.phone && (
          <a href={`tel:${branch.phone}`} className="mt-0.5 inline-flex items-center gap-1 text-muted hover:text-ink">
            <Phone className="h-3 w-3" aria-hidden="true" />
            {branch.phone}
          </a>
        )}
      </span>
      {branch.distanceKm !== null && <span className="shrink-0 text-muted">{formatDistance(branch.distanceKm)}</span>}
    </li>
  )
}

function BrandResult({ brand }) {
  const [first, ...others] = brand.branches
  return (
    <article className={`${card} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          {brand.logo ? (
            <img src={brand.logo} alt="" className="h-12 w-12 shrink-0 rounded-md border border-line object-cover" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-sand text-clay/60">
              <Store className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-semibold tracking-tight text-ink">{brand.name}</h2>
            <p className="text-[12.5px] text-muted">
              {brand.nearestKm !== null && <>{formatDistance(brand.nearestKm)} away · </>}
              {brand.branchCount} {brand.branchCount === 1 ? 'branch' : 'branches'}
            </p>
          </div>
        </div>
        <Link to={`/shop?brandId=${brand._id}`} className="text-[13px] font-medium text-clay hover:underline">
          See all products
        </Link>
      </div>

      <ul className="mt-3 divide-y divide-line border-t border-line">
        <BranchLine branch={first} />
      </ul>
      {others.length > 0 && (
        <details className="group border-t border-line">
          <summary className="cursor-pointer list-none py-2.5 text-[13px] font-medium text-ink/70 hover:text-ink">
            <span className="group-open:hidden">Show {others.length} more {others.length === 1 ? 'branch' : 'branches'}</span>
            <span className="hidden group-open:inline">Hide other branches</span>
          </summary>
          <ul className="divide-y divide-line">
            {others.map((b) => (
              <BranchLine key={b._id} branch={b} />
            ))}
          </ul>
        </details>
      )}

      {brand.products.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
          {brand.products.map((p) => (
            <ProductTile key={p._id} product={p} />
          ))}
        </div>
      )}
    </article>
  )
}

function ResultsSkeleton() {
  return (
    <div className="space-y-5">
      {[0, 1].map((i) => (
        <Skeleton key={i} className="h-72 w-full rounded-lg" />
      ))}
    </div>
  )
}

export default function Nearby() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const { city, cityId } = useCity()
  const { block, blockId, coords, range, setRange, blocksReady, openPicker, detect, status } = useNearby()

  const [draft, setDraft] = useState(q)
  // The page number belongs to one set of filters; changing any of them starts again at page 1.
  const filterKey = JSON.stringify([cityId, blockId, coords, range, q])
  const [pageState, setPageState] = useState({ filterKey, page: 1 })
  const page = pageState.filterKey === filterKey ? pageState.page : 1
  const setPage = (next) => setPageState({ filterKey, page: next })
  const [result, setResult] = useState({ key: '', data: null, error: '' })

  // Distance and block searches need somewhere to measure from; without it we
  // search the whole city and say so.
  const needsArea = (range === 'block' && !blockId) || (isRadius(range) && !blockId && !coords)

  const query = useMemo(() => {
    if (!cityId || !blocksReady) return null
    const base = { cityId, page, ...(q && { q }), ...(coords && { lat: coords.lat, lng: coords.lng }), ...(blockId && { blockId }) }
    if (range === 'block' && blockId) return { ...base, scope: 'block' }
    if (isRadius(range) && (blockId || coords)) return { ...base, scope: 'radius', radiusKm: range }
    return { ...base, scope: 'city' }
  }, [cityId, blocksReady, q, coords, blockId, range, page])

  const key = JSON.stringify(query)
  useEffect(() => {
    if (!query) return undefined
    let active = true
    api
      .get('/discover', { params: query })
      .then((res) => active && setResult({ key, data: res.data, error: '' }))
      .catch((err) => active && setResult({ key, data: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [key, query])

  const loading = Boolean(query) && result.key !== key
  const data = result.key === key ? result.data : null
  const error = result.key === key ? result.error : ''

  function onSearch(e) {
    e.preventDefault()
    const next = draft.trim()
    setParams(next ? { q: next } : {})
  }

  const bigger = nextRange(range)
  const items = data?.items || []

  return (
    <div className={`${wrap} py-8 sm:py-10`}>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[30px]">Shops near you</h1>
        <p className="mt-1.5 text-[13.5px] text-muted">
          Find brands and their products close to you — start with your block, then widen the search.
        </p>
      </header>

      <form onSubmit={onSearch} role="search" className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <label htmlFor="nearby-search" className="sr-only">
            Search a brand or product
          </label>
          <input
            id="nearby-search"
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search a brand or a product…"
            className={`h-11 pl-10 ${inputClass}`}
          />
        </div>
        <button type="submit" className={btnDark}>
          Search
        </button>
      </form>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <LocationChip />
        <RangeSelector />
      </div>

      {needsArea && cityId && (
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
          <span>Choose your area to search {range === 'block' ? 'your block' : `within ${range} km`}. Showing the whole city for now.</span>
          <button type="button" onClick={openPicker} className="font-semibold underline">
            Choose area
          </button>
        </p>
      )}

      <section className="mt-7" aria-live="polite">
        {!cityId ? (
          <EmptyState
            icon={MapPin}
            title="Where are you shopping?"
            message="Share your location or pick your city and area, and we'll show the shops near you."
            className="rounded-lg border border-dashed border-line bg-white"
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <button type="button" onClick={detect} disabled={status === 'detecting'} className={btnDark}>
                  <LocateFixed className="h-4 w-4" aria-hidden="true" />
                  Use my location
                </button>
                <button type="button" onClick={openPicker} className={btnOutline}>
                  Choose manually
                </button>
              </div>
            }
          />
        ) : loading || !query ? (
          <ResultsSkeleton />
        ) : error ? (
          <p className="text-clay">{error}</p>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Store}
            title={q ? `Nothing for “${q}” within ${rangeLabel(range)}` : `No shops within ${rangeLabel(range)} yet`}
            message={
              range === 'city'
                ? `We couldn't find any${q ? ' match' : ' shops'} in ${city?.name || 'this city'}. Try a different search.`
                : 'Try a wider range to see more shops.'
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
              {data.pagination.total} {data.pagination.total === 1 ? 'brand' : 'brands'} with {data.meta.totalBranches}{' '}
              {data.meta.totalBranches === 1 ? 'branch' : 'branches'}
              {q && <> for “{q}”</>}
              {range !== 'city' && !needsArea && <> within {rangeLabel(range)}</>}
              {block && range !== 'block' && <> of {block.name}</>}
            </p>
            <div className="space-y-5">
              {items.map((brand) => (
                <BrandResult key={brand._id} brand={brand} />
              ))}
            </div>
            {data.pagination.pages > 1 && (
              <div className="mt-7 flex items-center justify-between text-sm">
                <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={`${btnOutline} h-9 px-4`}>
                  Previous
                </button>
                <span className="text-muted">
                  Page {data.pagination.page} of {data.pagination.pages}
                </span>
                <button type="button" disabled={page >= data.pagination.pages} onClick={() => setPage(page + 1)} className={`${btnOutline} h-9 px-4`}>
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
