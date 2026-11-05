import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { getErrorMessage } from '../../services/api'
import { useNearby } from '../../hooks/useNearby'
import { isRadius } from '../../utils/range'
import { formatDistance } from '../../utils/geo'
import { formatPrice } from '../../ui'

/**
 * The same catalogue product at other stores in the shopper's area. The list is
 * area-only on purpose: city-wide offers would send a shopper to a shop they
 * cannot visit or order from. Without an area we ask for one; when no store in
 * it sells the item, we say so instead of showing a farther shop.
 */
export default function AlsoSoldBy({ catalogProductId, currentProductId }) {
  const { blockIds, origin, range } = useNearby()
  const area = blockIds.length
    ? {
        blockIds: blockIds.join(','),
        ...(origin && { lat: origin.lat, lng: origin.lng }),
        ...(origin && isRadius(range) && { radiusKm: range }),
      }
    : null
  const key = area ? JSON.stringify(area) : ''
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState({ key: '', item: null, status: 0, error: '' })

  useEffect(() => {
    if (!area || !catalogProductId) return undefined
    let active = true
    api
      .get(`/catalog/browse/${catalogProductId}`, { params: area })
      .then((res) => active && setResult({ key, item: res.data?.item || null, status: 200, error: '' }))
      .catch((err) => active && setResult({ key, item: null, status: err.response?.status || 0, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [key, catalogProductId, attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!catalogProductId) return null

  if (!area) {
    return (
      <section className="mt-12 border-t border-line pt-8">
        <p className="text-[13px] text-muted">
          Choose your area to see the other stores that sell this product.{' '}
          <Link to="/nearby" className="font-medium text-ink underline underline-offset-4">
            Choose area
          </Link>
        </p>
      </section>
    )
  }

  const loading = result.key !== key
  if (loading) return null

  const offers = (result.item?.offers || []).filter((offer) => String(offer.productId) !== String(currentProductId))

  if (result.status === 404) {
    return (
      <section className="mt-12 border-t border-line pt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Also sold by</h2>
        <p className="mt-2 text-[13px] text-muted">This product isn’t sold by any store in your area.</p>
      </section>
    )
  }

  if (result.status !== 200) {
    return (
      <section className="mt-12 border-t border-line pt-8">
        <p className="text-[13px] text-muted">
          {result.error || 'Other stores could not be loaded.'}{' '}
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-medium text-ink underline underline-offset-4">
            Try again
          </button>
        </p>
      </section>
    )
  }

  if (offers.length === 0) {
    return result.item ? (
      <section className="mt-12 border-t border-line pt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Also sold by</h2>
        <p className="mt-2 text-[13px] text-muted">Only sold at this store in your area.</p>
      </section>
    ) : null
  }

  return (
    <section className="mt-12 border-t border-line pt-8" aria-labelledby="also-sold-by">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="also-sold-by" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Also sold by
        </h2>
        <Link to="/nearby" className="text-[12.5px] text-muted transition hover:text-ink">
          Change area
        </Link>
      </div>
      <p className="mt-1 text-[12.5px] text-muted">The same product at other stores in your area.</p>
      <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-white px-5">
        {offers.map((offer) => (
          <li key={offer.productId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-[13px]">
            <span className="min-w-0">
              <Link to={`/product/${offer.productId}`} className="font-medium text-ink hover:underline">
                {offer.brandName}
              </Link>
              <span className="ml-2 text-muted">
                {[
                  offer.nearestKm !== null && offer.nearestKm !== undefined && `${formatDistance(offer.nearestKm)} away`,
                  offer.branchCount > 1 && `${offer.branchCount} shops`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <span className="shrink-0">
              {offer.availability === 'OUT_OF_STOCK' && <span className="mr-2 text-clay">Sold out</span>}
              {offer.compareAtPrice > offer.price && <span className="mr-1.5 text-muted line-through">{formatPrice(offer.compareAtPrice)}</span>}
              <span className="font-semibold text-ink">{formatPrice(offer.price)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
