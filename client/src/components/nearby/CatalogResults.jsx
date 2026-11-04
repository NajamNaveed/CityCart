import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { getErrorMessage } from '../../services/api'
import ProductImage from '../ProductImage'
import { EmptyState, Skeleton } from '../ui'
import { formatDistance } from '../../utils/geo'
import { btnOutline, card, formatPrice } from '../../ui'
import { Package } from 'lucide-react'

const SORTS = [
  ['name', 'Name'],
  ['price', 'Lowest price'],
  ['nearest', 'Nearest store'],
]

function Offer({ offer }) {
  const soldOut = offer.availability === 'OUT_OF_STOCK'
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[13px]">
      <span className="min-w-0">
        <Link to={`/product/${offer.productId}`} className="font-medium text-ink hover:underline">
          {offer.brandName}
        </Link>
        <span className="ml-2 text-muted">
          {[offer.nearestKm !== null && `${formatDistance(offer.nearestKm)} away`, offer.branchCount > 1 && `${offer.branchCount} shops`]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      <span className="shrink-0">
        {soldOut ? <span className="mr-2 text-danger">Sold out</span> : null}
        {offer.compareAtPrice > offer.price && <span className="mr-1.5 text-muted line-through">{formatPrice(offer.compareAtPrice)}</span>}
        <span className="font-semibold text-ink">{formatPrice(offer.price)}</span>
      </span>
    </li>
  )
}

/** One real product with every store that sells it in the shopper's area. */
function ProductCard({ item }) {
  const [open, setOpen] = useState(false)
  const details = [item.manufacturer, item.size?.value ? `${item.size.value} ${item.size.unit}` : ''].filter(Boolean).join(' · ')
  return (
    <article className={`${card} p-4`}>
      <div className="flex gap-3.5">
        <ProductImage src={item.images?.[0]} name={item.name} width={200} className="h-20 w-20 shrink-0 rounded-md object-cover" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-ink">{item.name}</h3>
          {details && <p className="truncate text-[12.5px] text-muted">{details}</p>}
          <p className="mt-1 text-[13.5px] text-ink">
            {item.offerCount > 1 ? 'from ' : ''}
            <span className="font-semibold">{formatPrice(item.minPrice)}</span>
            <span className="text-muted">
              {' '}
              · {item.offerCount} {item.offerCount === 1 ? 'store' : 'stores'}
            </span>
            {!item.inStock && <span className="ml-1.5 text-danger">Sold out</span>}
          </p>
        </div>
      </div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="mt-3 text-[13px] font-medium text-clay hover:underline">
        {open ? 'Hide stores' : item.offerCount > 1 ? `Compare ${item.offerCount} stores` : 'See the store'}
      </button>
      {open && <ul className="mt-2 divide-y divide-line border-t border-line">{item.offers.map((o) => <Offer key={o.productId} offer={o} />)}</ul>}
    </article>
  )
}

// The shared catalogue inside the shopper's area: each product once, with its offers.
export default function CatalogResults({ blockIds, origin, radiusKm, q }) {
  const [sort, setSort] = useState('name')
  const [pageState, setPageState] = useState({ key: '', page: 1 })
  const [result, setResult] = useState({ key: '', data: null, error: '' })

  const effectiveSort = sort === 'nearest' && !origin ? 'name' : sort
  const params = {
    blockIds: blockIds.join(','),
    sort: effectiveSort,
    limit: 12,
    ...(q && { q }),
    ...(origin && { lat: origin.lat, lng: origin.lng }),
    ...(origin && radiusKm && { radiusKm }),
  }
  const filterKey = JSON.stringify(params)
  const page = pageState.key === filterKey ? pageState.page : 1
  const key = `${filterKey}|${page}`

  useEffect(() => {
    let active = true
    api
      .get('/catalog/browse', { params: { ...JSON.parse(filterKey), page } })
      .then((res) => active && setResult({ key, data: res.data, error: '' }))
      .catch((err) => active && setResult({ key, data: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [filterKey, page, key])

  const loading = result.key !== key
  const data = result.key === key ? result.data : null
  const error = result.key === key ? result.error : ''

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          {data ? `${data.pagination.total} ${data.pagination.total === 1 ? 'product' : 'products'} in your area` : 'Looking for products…'}
        </p>
        <label className="flex items-center gap-2 text-[13px] text-muted">
          Sort by
          <select value={effectiveSort} onChange={(e) => setSort(e.target.value)} className="h-9 rounded-md border border-line bg-white px-2.5 text-[13px] text-ink">
            {SORTS.filter(([value]) => value !== 'nearest' || origin).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p className="text-clay">{error}</p>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-lg" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={q ? `No products for “${q}” in your area` : 'No products in your area yet'}
          message="Try a wider range, another block, or a different search."
          className="rounded-lg border border-dashed border-line bg-white"
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.items.map((item) => (
              <ProductCard key={item.catalogProductId} item={item} />
            ))}
          </div>
          {data.pagination.pages > 1 && (
            <div className="mt-7 flex items-center justify-between text-sm">
              <button type="button" disabled={page <= 1} onClick={() => setPageState({ key: filterKey, page: page - 1 })} className={`${btnOutline} h-9 px-4`}>
                Previous
              </button>
              <span className="text-muted">
                Page {data.pagination.page} of {data.pagination.pages}
              </span>
              <button type="button" disabled={page >= data.pagination.pages} onClick={() => setPageState({ key: filterKey, page: page + 1 })} className={`${btnOutline} h-9 px-4`}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
