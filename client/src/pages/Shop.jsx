import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, Search, SearchX, SlidersHorizontal, X } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import { useCity } from '../hooks/useCity'
import { useBrands } from '../hooks/useBrands'
import ProductCard from '../components/ProductCard'
import { useRatings } from '../hooks/useRatings'
import { Drawer, EmptyState, Reveal, Skeleton } from '../components/ui'
import { sectionLabel, wrap } from '../ui'

const PAGE_SIZE = 12

const SORTS = {
  newest: 'Newest first',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  name: 'Name: A to Z',
}

const SORT_PARAMS = {
  newest: { sort: 'createdAt', order: 'desc' },
  'price-asc': { sort: 'price', order: 'asc' },
  'price-desc': { sort: 'price', order: 'desc' },
  name: { sort: 'name', order: 'asc' },
}

// Everything that narrows the list — one definition, used by both the
// desktop rail and the mobile filter drawer.
function FilterPanel({ search, brands, brandId, sortKey, onSearch, onBrand, onSort }) {
  return (
    <div className="space-y-7">
      <div>
        <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Search</p>
        <form onSubmit={onSearch} role="search">
          <label className="sr-only" htmlFor="shop-search">
            Search products
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              key={search}
              id="shop-search"
              name="q"
              defaultValue={search}
              placeholder="Search products…"
              className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-3.5 text-[13px] text-ink outline-none transition focus:border-ink"
            />
          </div>
        </form>
      </div>

      <div>
        <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Brands</p>
        <ul className="space-y-1">
          <li>
            <button
              type="button"
              onClick={() => onBrand('')}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13.5px] transition ${
                !brandId ? 'bg-paper font-semibold text-ink' : 'text-ink/70 hover:bg-paper hover:text-ink'
              }`}
            >
              All brands
              {!brandId && <Check className="h-3.5 w-3.5 text-clay" aria-hidden="true" />}
            </button>
          </li>
          {brands.map((b) => (
            <li key={b._id}>
              <button
                type="button"
                onClick={() => onBrand(b._id)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13.5px] transition ${
                  brandId === b._id
                    ? 'bg-paper font-semibold text-ink'
                    : 'text-ink/70 hover:bg-paper hover:text-ink'
                }`}
              >
                <span className="truncate">{b.name}</span>
                {brandId === b._id && <Check className="h-3.5 w-3.5 shrink-0 text-clay" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Sort by</p>
        <ul className="space-y-1">
          {Object.entries(SORTS).map(([value, label]) => (
            <li key={value}>
              <button
                type="button"
                onClick={() => onSort(value)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13.5px] transition ${
                  sortKey === value
                    ? 'bg-paper font-semibold text-ink'
                    : 'text-ink/70 hover:bg-paper hover:text-ink'
                }`}
              >
                {label}
                {sortKey === value && <Check className="h-3.5 w-3.5 text-clay" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default function Shop() {
  const [params, setParams] = useSearchParams()
  const { city, cityId } = useCity()
  const { brands } = useBrands(cityId)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const search = params.get('search') || ''
  const brandId = params.get('brandId') || ''
  const sortKey = SORT_PARAMS[params.get('sort')] ? params.get('sort') : 'newest'
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [result, setResult] = useState({ key: null, items: [], pagination: null, error: '' })
  const key = JSON.stringify([cityId, search, brandId, sortKey, page])

  useEffect(() => {
    let active = true
    api
      .get('/products', {
        params: {
          limit: PAGE_SIZE,
          page,
          ...SORT_PARAMS[sortKey],
          ...(search && { search }),
          ...(brandId && { brandId }),
          ...(cityId && { cityId }),
        },
      })
      .then((res) => active && setResult({ key, items: res.data.products, pagination: res.data.pagination, error: '' }))
      .catch((err) => active && setResult({ key, items: [], pagination: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [cityId, search, brandId, sortKey, page, key])

  function update(patch) {
    const next = new URLSearchParams(params)
    Object.entries({ page: undefined, ...patch }).forEach(([k, v]) => {
      if (v === undefined || v === '' || v === 'newest' || v === 1) next.delete(k)
      else next.set(k, String(v))
    })
    setParams(next)
  }

  function onSearch(e) {
    e.preventDefault()
    update({ search: new FormData(e.currentTarget).get('q').toString().trim() })
  }

  const loading = result.key !== key
  const brandName = Object.fromEntries(brands.map((b) => [b._id, b.name]))
  const ratings = useRatings(result.items.map((p) => p._id))
  const activeBrand = brands.find((b) => b._id === brandId)
  const pg = result.pagination
  const hasActiveFilters = Boolean(search || brandId)

  const panel = (
    <FilterPanel
      search={search}
      brands={brands}
      brandId={brandId}
      sortKey={sortKey}
      onSearch={onSearch}
      onBrand={(v) => {
        update({ brandId: v })
        setFiltersOpen(false)
      }}
      onSort={(v) => {
        update({ sort: v })
        setFiltersOpen(false)
      }}
    />
  )

  return (
    <div className={`${wrap} py-10`}>
      <p className={sectionLabel}>Shop</p>
      <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {activeBrand ? activeBrand.name : search ? `Results for “${search}”` : 'All products'}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {city ? `Selling in ${city.name}` : 'Selling in every city'}
        {pg ? ` · ${pg.total} ${pg.total === 1 ? 'product' : 'products'}` : ''}
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[15rem_1fr]">
        {/* Desktop filter rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 h-fit rounded-lg border border-line bg-white p-5">{panel}</div>
        </aside>

        <div>
          {/* Mobile toolbar */}
          <div className="mb-5 flex items-center gap-2.5 lg:hidden">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-[13px] font-medium text-ink transition hover:border-ink"
            >
              <SlidersHorizontal className="h-4 w-4 text-muted" aria-hidden="true" />
              Filters
              {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-clay" aria-hidden="true" />}
            </button>
          </div>

          {hasActiveFilters && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {search && (
                <button
                  type="button"
                  onClick={() => update({ search: '' })}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] text-ink shadow-sm shadow-ink/5 transition hover:bg-sand"
                >
                  “{search}”
                  <X className="h-3 w-3 text-muted" aria-hidden="true" />
                </button>
              )}
              {activeBrand && (
                <button
                  type="button"
                  onClick={() => update({ brandId: '' })}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] text-ink shadow-sm shadow-ink/5 transition hover:bg-sand"
                >
                  {activeBrand.name}
                  <X className="h-3 w-3 text-muted" aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3">
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i}>
                  <Skeleton className="aspect-[4/5] w-full rounded-lg" />
                  <Skeleton className="mt-3 h-3.5 w-2/3" />
                  <Skeleton className="mt-2 h-3.5 w-1/3" />
                </div>
              ))}
            </div>
          ) : result.error ? (
            <p className="text-clay">{result.error}</p>
          ) : result.items.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nothing matches that."
              message="Try a different search, brand or city."
              className="py-20"
            />
          ) : (
            <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3">
              {result.items.map((p, i) => (
                <Reveal key={p._id} delay={Math.min(i, 8) * 0.04} className="h-full">
                  <ProductCard product={p} brandName={brandName[p.brandId]} rating={ratings[p._id]} />
                </Reveal>
              ))}
            </div>
          )}

          {pg && pg.pages > 1 && (
            <div className="mt-14 flex items-center justify-center gap-4">
              <button
                type="button"
                disabled={pg.page <= 1}
                onClick={() => update({ page: pg.page - 1 })}
                className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line bg-white px-4 text-[13px] font-medium text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </button>
              <span className="text-sm text-muted">
                Page {pg.page} of {pg.pages}
              </span>
              <button
                type="button"
                disabled={pg.page >= pg.pages}
                onClick={() => update({ page: pg.page + 1 })}
                className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line bg-white px-4 text-[13px] font-medium text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      <Drawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        {panel}
      </Drawer>
    </div>
  )
}
