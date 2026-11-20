import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import ProductImage from '../ProductImage'
import { formatPrice } from '../../ui'
import { formatDistance } from '../../utils/geo'

// The colour is the artwork, so it carries meaning: a shop's category decides
// its hue, and two shops selling the same thing always wear the same colour.
// The families cover the category names the catalogue actually uses, checked
// most specific first so "Footwear" never borrows clothing's colour and
// "Watches" never borrows hardware's. Anything unlisted still gets a stable
// hue hashed from its own name. Every hue stays dark enough to hold white type.
const BLOOM_HUES = [
  [/shoe|footwear|chappal|sandal|khussa|slipper/, 288],
  [/jewel|necklac|earring|bangle|watch|gold|silver|plated/, 46],
  [/kurta|shalwar|kameez|waistcoat|cloth|fabric|silk|scarf|tailor|wear|fashion|dress|shirt|jean|suit|beaut|cosmet|skincare|perfume/, 330],
  [/home|living|bedding|cushion|decor|household|bath|towel|pottery|khes|wall|shelf|kitchen|dining|furnish|lamp/, 178],
  [/electronic|phone|gadget|charger|laptop|audio|device|tech/, 215],
  [/stationer|office|book|paper|pen|print|custom/, 252],
  [/bag|travel|luggage|belt|wallet|backpack|suitcase/, 20],
  [/fruit|veget|grocer|produce|farm|herb|salad|milk|dairy|egg/, 148],
  [/bake|bread|cake|confect|sweet|chocol|caf|coffee|tea|snack/, 34],
  [/meat|fish|spice|masala|food|restaur|grill|burger|pizza/, 10],
]

function bloomHue(store) {
  const category = (store.category || '').toLowerCase()
  for (const [pattern, hue] of BLOOM_HUES) {
    if (pattern.test(category)) return hue
  }
  let hash = 0
  for (const character of category || store.name || '') {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return hash % 360
}

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
  const blockNames = [...new Set(branches.map((branch) => branch.blockName).filter(Boolean))]
  const where = [blockNames[0], formatDistance(store.nearestKm)].filter(Boolean).join(' · ') || 'Nearby'
  // A RESTRICTED seller is still listed, so the card has to say what changed.
  const paused = store.acceptingNewOrders === false
  const status = paused ? 'Orders paused' : inBlock ? 'In your block' : 'Accepting orders'
  const branchCount = store.branchCount || branches.length || 1
  const kicker = [store.category, `${branchCount} ${branchCount === 1 ? 'branch' : 'branches'}`]
    .filter(Boolean)
    .join(' · ')
  const fromPrice = products.reduce(
    (lowest, product) => (lowest === null || product.price < lowest ? product.price : lowest),
    null,
  )
  const shopUrl = `/store/${store._id}`

  return (
    <article
      className="store-bloom group relative flex h-full flex-col overflow-hidden rounded-panel p-4 text-cream shadow-[0_18px_40px_rgba(21,20,15,0.16)] transition-transform duration-300 motion-safe:hover:-translate-y-1"
      style={{ '--bloom-h': bloomHue(store) }}
    >
      <span className="store-bloom-ring" aria-hidden="true" />
      <span className="store-bloom-ring is-wide" aria-hidden="true" />

      <div className="relative z-[2] flex flex-wrap items-center gap-2">
        <span className="store-bloom-chip">{where}</span>
        <span className={`store-bloom-chip${paused ? ' is-alert' : ''}`}>{status}</span>
        {/* The initials sit under the logo, so a logo that never arrives still
            leaves the shop with a mark of its own. */}
        <span className="relative ml-auto flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/25 bg-white/15 font-display text-[12px] tracking-[0.06em] text-cream/90">
          {initials(store.name)}
          {store.logo && (
            <img src={store.logo} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          )}
        </span>
      </div>

      <div className="relative z-[2] mt-7 min-w-0">
        <h3 className="text-balance font-display text-[30px] font-semibold leading-[1.03] tracking-[-0.03em] [text-shadow:0_2px_18px_rgba(0,0,0,0.12)]">
          <Link to={shopUrl} className="transition-colors hover:text-cream/75">
            {store.name}
          </Link>
        </h3>
        <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.16em] text-cream/80">{kicker}</p>
      </div>

      <div className="relative z-[2] mt-auto pt-6">
        <div className="rounded-[18px] border border-line-warm bg-paper-warm p-3 text-ink shadow-[0_14px_30px_rgba(21,20,15,0.16)]">
          {products.length > 0 ? (
            <div className="grid grid-cols-3 gap-1">
              {products.slice(0, 3).map((product) => (
                <Link
                  key={product._id}
                  to={`/product/${product._id}`}
                  aria-label={`${product.name} — ${formatPrice(product.price)}`}
                  className="group/tile min-w-0 rounded-tile p-1 transition-colors hover:bg-sand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
                >
                  <span
                    className={`block overflow-hidden rounded-tile ${
                      product.availability === 'OUT_OF_STOCK' ? 'opacity-40' : ''
                    }`}
                  >
                    <ProductImage
                      src={product.image}
                      name={product.name}
                      className="aspect-square w-full transition-transform duration-300 group-hover/tile:scale-[1.05]"
                      fallbackClassName="text-[13px] font-display tracking-[0.06em] text-clay/55"
                      width={200}
                    />
                  </span>
                  <span className="mt-1.5 block truncate text-[10px] font-medium text-ink/80">{product.name}</span>
                  <span className="block text-[9.5px] tabular-nums text-muted">{formatPrice(product.price)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-2 text-[11.5px] text-ink/60">
              {blockNames.length > 0 ? `Shops in ${blockNames.slice(0, 2).join(' and ')}` : 'Local shop'}
            </p>
          )}

          <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-line-warm pt-2.5">
            <p className="min-w-0">
              <span className="block text-[9px] font-medium uppercase tracking-[0.16em] text-muted">From</span>
              <span className="font-display text-[15px] font-semibold text-ink">
                {fromPrice === null ? 'Ask in shop' : formatPrice(fromPrice)}
              </span>
            </p>
            <Link
              to={shopUrl}
              aria-label={`Visit ${store.name}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-noir text-cream transition-colors duration-300 hover:bg-clay"
            >
              <ArrowUpRight
                className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-45"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}
