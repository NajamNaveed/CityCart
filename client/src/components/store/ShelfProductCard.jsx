import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Minus, MapPin, Plus } from 'lucide-react'
import ProductImage from '../ProductImage'
import { optimizedUrl } from '../optimizeImage'
import { flyFromCart, flyToCart } from '../../utils/flyToCart'
import { useAuth } from '../../hooks/useAuth'
import { useCart } from '../../hooks/useCart'
import { getErrorMessage } from '../../services/api'
import { loginUrl } from '../../utils/nav'
import { formatPrice } from '../../ui'

// Same per-product ceiling the product page uses; the server caps at 99.
const MAX_QTY = 10

/**
 * One item on a shelf — the store page's row and the home page's grid use the
 * same tile, so an item looks the same wherever it is picked from. The photo
 * goes to the product page, the + puts it in the cart straight away — the
 * photo itself lifts off the tile and drops into the tray — and once it is in
 * the cart the + becomes a stepper driven by the cart's own quantity, not by
 * local state, so the shelf and the tray can never disagree.
 *
 * `meta` adds a quiet second line (the shop and its distance) on pages where
 * the shelf is not already under the store's name.
 */
export default function ShelfProductCard({
  product,
  meta,
  className = 'shrink-0 grow basis-[164px] snap-start sm:basis-[178px] lg:max-w-[230px]',
}) {
  const { user } = useAuth()
  const { addItem, updateItem, removeItem, quantityFor } = useCart()
  const navigate = useNavigate()
  const location = useLocation()
  const photoRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const quantity = quantityFor(product._id)
  const soldOut = product.availability === 'OUT_OF_STOCK'
  // Store shelves carry `images`; the home feed's slim product carries `image`.
  const image = product.images?.[0] || product.image
  // The URL the tile already loaded, so both the flying photo and the tray
  // thumbnail it lands on are painted from the browser cache.
  const photo = image ? optimizedUrl(image, 420) : ''
  const discount =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round((1 - product.price / product.compareAtPrice) * 100)
      : 0

  // Guests sign in and land back on this store; staff are told, not silently blocked.
  function askForCustomer() {
    if (!user) {
      navigate(loginUrl(location.pathname + location.search))
      return true
    }
    if (user.role !== 'CUSTOMER') {
      setNote('Sign in with a customer account to shop.')
      return true
    }
    return false
  }

  async function run(request) {
    setNote('')
    setBusy(true)
    try {
      await request()
    } catch (err) {
      setNote(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function onAdd() {
    if (soldOut || busy || quantity >= MAX_QTY) return
    if (askForCustomer()) return
    // Reserve the tray slot first: the flight reads its destination one frame
    // later, when React has rendered that slot.
    run(() => addItem(product._id, 1, { name: product.name, image: photo }))
    flyToCart({ from: photoRef.current, productId: product._id, src: photo, name: product.name })
  }

  function onStep(delta) {
    if (busy) return
    const next = quantity + delta
    if (next < 1) {
      // The last unit goes back the way it came.
      flyFromCart({ to: photoRef.current, productId: product._id, src: photo, name: product.name })
      run(() => removeItem(product._id))
      return
    }
    if (next > MAX_QTY) return
    run(() => updateItem(product._id, next))
  }

  return (
    // The tiles grow to fill a short shelf and stop growing at 230px, so a
    // five-item category still reads as a stocked row instead of a sparse one.
    <article
      className={`group flex flex-col rounded-card border border-line-warm bg-paper-warm p-2 transition-all duration-300 hover:-translate-y-1 hover:border-gold/45 hover:shadow-[0_24px_44px_-28px_rgba(21,20,15,0.4)] ${className}`}
    >
      <div ref={photoRef} className="img-zoom relative overflow-hidden rounded-tile bg-sand">
        <Link to={`/product/${product._id}`} className="block" aria-label={product.name}>
          <ProductImage src={image} name={product.name} className="aspect-square w-full" width={420} />
        </Link>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-noir/15 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        />
        {soldOut ? (
          <span className="absolute left-2 top-2 rounded-full bg-noir/90 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-cream backdrop-blur-sm">
            Sold out
          </span>
        ) : (
          discount > 0 && (
            <span className="absolute left-2 top-2 rounded-full bg-clay px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white">
              {discount}% off
            </span>
          )
        )}
      </div>

      <div className="flex flex-1 flex-col px-1 pb-0.5 pt-2.5">
        <h4 className="line-clamp-2 font-display text-[14.5px] font-semibold leading-snug tracking-tight text-ink">
          <Link to={`/product/${product._id}`} className="transition-colors hover:text-clay">
            {product.name}
          </Link>
        </h4>
        {meta && (
          <p className="mt-1 flex items-center gap-1 text-[10.5px] text-muted">
            <MapPin className="h-3 w-3 shrink-0 text-clay/70" aria-hidden="true" />
            <span className="truncate">{meta}</span>
          </p>
        )}
        {product.availability === 'LOW_STOCK' && (
          <p className="mt-1 text-[10.5px] font-medium text-clay">Only a few left</p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
          <p className="leading-tight">
            <span className="font-display block text-[14.5px] font-semibold text-ink">{formatPrice(product.price)}</span>
            {discount > 0 && (
              <span className="text-[10.5px] text-muted line-through">{formatPrice(product.compareAtPrice)}</span>
            )}
          </p>

          {soldOut ? (
            // Kept as a muted + so every price row lines up; the photo already
            // says "Sold out", so this only has to read as "not available".
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line text-muted" aria-hidden="true">
              <Plus className="h-4 w-4" />
            </span>
          ) : quantity > 0 ? (
            <div
              className="flex h-8 shrink-0 items-stretch overflow-hidden rounded-full border border-noir bg-paper-warm"
              role="group"
              aria-label={`${product.name} quantity`}
            >
              <button
                type="button"
                onClick={() => onStep(-1)}
                disabled={busy}
                aria-label="One less"
                className="flex w-7 items-center justify-center text-ink transition-colors hover:bg-noir/5 disabled:opacity-40"
              >
                <Minus className="h-3 w-3" aria-hidden="true" />
              </button>
              <span
                className="flex w-6 items-center justify-center text-[12px] font-semibold tabular-nums text-ink"
                aria-live="polite"
              >
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => onStep(1)}
                disabled={busy || quantity >= MAX_QTY}
                aria-label="One more"
                className="flex w-7 items-center justify-center text-ink transition-colors hover:bg-noir/5 disabled:opacity-40"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              disabled={busy}
              aria-label={`Add ${product.name} to cart`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-clay to-clay-dark text-white shadow-[0_6px_14px_-6px_rgba(182,71,42,0.8)] transition-all duration-200 hover:brightness-110 active:scale-95 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {note && (
          <p className="mt-1.5 line-clamp-2 text-[10.5px] leading-snug text-clay" role="status">
            {note}
          </p>
        )}
      </div>
    </article>
  )
}
