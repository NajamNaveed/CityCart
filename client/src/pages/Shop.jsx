import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api, { getErrorMessage } from '../services/api'
import { useCity } from '../hooks/useCity'
import { useBrands } from '../hooks/useBrands'
import ProductCard from '../components/ProductCard'
import { useRatings } from '../hooks/useRatings'
import { btnOutline, wrap } from '../ui'

const PAGE_SIZE = 12

const SORTS = {
  newest: { label: 'Newest', sort: 'createdAt', order: 'desc' },
  'price-asc': { label: 'Price: low to high', sort: 'price', order: 'asc' },
  'price-desc': { label: 'Price: high to low', sort: 'price', order: 'desc' },
  name: { label: 'Name: A to Z', sort: 'name', order: 'asc' },
}

const selectClass = 'h-10 rounded-sm border border-line bg-paper px-3 text-[13px] outline-none focus:border-ink'

export default function Shop() {
  const [params, setParams] = useSearchParams()
  const { city, cityId } = useCity()
  const { brands } = useBrands(cityId)

  const search = params.get('search') || ''
  const brandId = params.get('brandId') || ''
  const sortKey = SORTS[params.get('sort')] ? params.get('sort') : 'newest'
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [result, setResult] = useState({ key: null, items: [], pagination: null, error: '' })
  const key = JSON.stringify([cityId, search, brandId, sortKey, page])

  useEffect(() => {
    let active = true
    const { sort, order } = SORTS[sortKey]
    api
      .get('/products', {
        params: {
          limit: PAGE_SIZE,
          page,
          sort,
          order,
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

  return (
    <div className={`${wrap} py-10`}>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {activeBrand ? activeBrand.name : search ? `Results for “${search}”` : 'All products'}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {city ? `Selling in ${city.name}` : 'Selling in every city'}
        {pg ? ` · ${pg.total} ${pg.total === 1 ? 'product' : 'products'}` : ''}
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-y border-line py-4">
        <form onSubmit={onSearch} className="flex flex-1 basis-64 gap-2" role="search">
          <label htmlFor="shop-search" className="sr-only">
            Search products
          </label>
          <input
            key={search}
            id="shop-search"
            name="q"
            defaultValue={search}
            placeholder="Search products"
            className="h-10 min-w-0 flex-1 rounded-sm border border-line bg-paper px-3 text-[13px] outline-none focus:border-ink"
          />
          <button type="submit" className="h-10 rounded-sm bg-ink px-4 text-[12px] font-medium uppercase tracking-[0.1em] text-cream hover:bg-black">
            Search
          </button>
        </form>

        <label className="sr-only" htmlFor="brand-filter">
          Brand
        </label>
        <select id="brand-filter" value={brandId} onChange={(e) => update({ brandId: e.target.value })} className={selectClass}>
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b._id} value={b._id}>
              {b.name}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="sort">
          Sort by
        </label>
        <select id="sort" value={sortKey} onChange={(e) => update({ sort: e.target.value })} className={selectClass}>
          {Object.entries(SORTS).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-8">
        {loading ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="aspect-[4/5] animate-pulse bg-sand" />
            ))}
          </div>
        ) : result.error ? (
          <p className="text-clay">{result.error}</p>
        ) : result.items.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg font-medium">Nothing matches that.</p>
            <p className="mt-1 text-sm text-muted">Try a different search, brand or city.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {result.items.map((p) => (
              <ProductCard key={p._id} product={p} brandName={brandName[p.brandId]} rating={ratings[p._id]} />
            ))}
          </div>
        )}
      </div>

      {pg && pg.pages > 1 && (
        <div className="mt-14 flex items-center justify-center gap-6">
          <button type="button" className={btnOutline} disabled={pg.page <= 1} onClick={() => update({ page: pg.page - 1 })}>
            Previous
          </button>
          <span className="text-sm text-muted">
            Page {pg.page} of {pg.pages}
          </span>
          <button type="button" className={btnOutline} disabled={pg.page >= pg.pages} onClick={() => update({ page: pg.page + 1 })}>
            Next
          </button>
        </div>
      )}
    </div>
  )
}