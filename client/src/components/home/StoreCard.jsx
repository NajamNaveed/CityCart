import { Link } from 'react-router-dom'
import { ArrowUpRight, MapPin } from 'lucide-react'
import ProductImage from '../ProductImage'
import { formatPrice } from '../../ui'
import { card, cardLift } from '../../design'
import { formatDistance } from '../../utils/geo'

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

export default function StoreCard({ store, inBlock }) {
  const products = Array.isArray(store.products) ? store.products : []
  const branches = Array.isArray(store.branches) ? store.branches : []
  const cover = store.cover || products.find((product) => product.image)?.image || store.logo
  const fromPrice = products.reduce(
    (lowest, product) => (lowest === null || product.price < lowest ? product.price : lowest),
    null,
  )
  const blockNames = [...new Set(branches.map((branch) => branch.blockName).filter(Boolean))]
  const where = formatDistance(store.nearestKm) || blockNames[0] || 'Nearby'
  const popular = products.slice(0, 3).map((product) => product.name)
  const shopUrl = `/nearby?q=${encodeURIComponent(store.name)}`

  return (
    <article className={`group flex h-full flex-col overflow-hidden ${card} ${cardLift}`}>
      <Link to={shopUrl} tabIndex={-1} aria-hidden="true" className="relative block overflow-hidden bg-sand">
        <ProductImage src={cover} name={store.name} className="aspect-[4/3] w-full" width={700} />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-cream/90 px-2.5 py-1 text-[10.5px] font-medium text-noir backdrop-blur-sm">
          <MapPin className="h-3 w-3 text-clay" aria-hidden="true" />
          {where}
        </span>
        {inBlock && (
          <span className="absolute right-3 top-3 rounded-full bg-noir px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-cream">
            Your block
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          {store.logo ? (
            <img
              src={store.logo}
              alt=""
              className="h-10 w-10 shrink-0 rounded-tile border border-line-warm object-cover"
              loading="lazy"
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tile bg-sand text-[12px] font-semibold text-clay/70">
              {initials(store.name)}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="truncate font-display text-[19px] font-semibold leading-tight tracking-tight text-ink">
              <Link to={shopUrl} className="transition-colors hover:text-clay">
                {store.name}
              </Link>
            </h3>
            <p className="mt-0.5 truncate text-[11.5px] text-muted">
              {blockNames.length > 0 ? blockNames.slice(0, 2).join(' · ') : 'Local shop'}
              {' · '}
              {store.branchCount} {store.branchCount === 1 ? 'branch' : 'branches'}
            </p>
          </div>
        </div>

        {popular.length > 0 && (
          <p className="mt-3 line-clamp-2 text-[12.5px] leading-relaxed text-ink/60">
            <span className="font-medium text-ink/75">Popular here:</span> {popular.join(', ')}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-line-warm pt-3.5">
          <p className="min-w-0">
            <span className="block text-[9.5px] font-medium uppercase tracking-[0.16em] text-muted">From</span>
            <span className="text-[14px] font-semibold text-ink">
              {fromPrice === null ? 'Ask in shop' : formatPrice(fromPrice)}
            </span>
          </p>
          <Link
            to={shopUrl}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-noir px-3.5 text-[11px] font-medium uppercase tracking-[0.08em] text-cream transition-colors hover:bg-noir-soft"
          >
            Visit
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  )
}
