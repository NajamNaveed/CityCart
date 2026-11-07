import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Check, MapPin, Minus, Plus, X } from 'lucide-react'
import ProductImage from './ProductImage'
import Stars from './Stars'
import { useAuth } from '../hooks/useAuth'
import { useCart } from '../hooks/useCart'
import { getErrorMessage } from '../services/api'
import { loginUrl } from '../utils/nav'
import { formatPrice } from '../ui'

// Same per-add ceiling as the product page.
const MAX_QTY = 10

export default function ProductCard({ product, brandName, storeLabel, rating }) {
  const { user } = useAuth()
  const { addItem } = useCart()
  const navigate = useNavigate()
  const location = useLocation()
  const [status, setStatus] = useState('idle') // idle | adding | added
  const [note, setNote] = useState('')
  const [picking, setPicking] = useState(false) // the quantity stepper replaces the button
  const [qty, setQty] = useState(1)

  const soldOut = product.availability === 'OUT_OF_STOCK'
  const discount =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round((1 - product.price / product.compareAtPrice) * 100)
      : 0
  const store = storeLabel || brandName

  function onAdd() {
    // Guests are asked to sign in and then land back on this exact page.
    if (!user) {
      navigate(loginUrl(location.pathname + location.search))
      return
    }
    if (user.role !== 'CUSTOMER') {
      setNote('Sign in with a customer account to shop.')
      return
    }
    setNote('')
    setQty(1)
    setPicking(true)
  }

  async function onConfirm() {
    setStatus('adding')
    setNote('')
    try {
      await addItem(product._id, qty)
      setStatus('added')
      setPicking(false)
      setQty(1)
      setTimeout(() => setStatus('idle'), 1800)
    } catch (err) {
      setStatus('idle')
      setNote(getErrorMessage(err))
    }
  }

  return (
    <article className="group flex h-full flex-col rounded-card border border-line-warm bg-paper-warm p-2.5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_45px_rgba(21,20,15,0.08)]">
      <div className="relative overflow-hidden rounded-tile bg-sand">
        <Link to={`/product/${product._id}`} className="block" aria-label={product.name}>
          <ProductImage
            src={product.images?.[0] || product.image}
            name={product.name}
            className="aspect-[4/5] w-full"
            width={700}
          />
        </Link>
        {soldOut && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-noir/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-cream backdrop-blur-sm">
            Sold out
          </span>
        )}
        {!soldOut && discount > 0 && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-clay px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white">
            {discount}% off
          </span>
        )}
        {store && (
          <span className="absolute bottom-2.5 left-2.5 inline-flex max-w-[calc(100%-20px)] items-center gap-1 rounded-full bg-cream/90 px-2.5 py-1 text-[10px] font-medium text-ink/80 backdrop-blur-sm">
            <MapPin className="h-3 w-3 shrink-0 text-clay" aria-hidden="true" />
            <span className="truncate">{store}</span>
          </span>
        )}
        {!soldOut && status !== 'idle' && user?.role === 'CUSTOMER' && (
          <span className="absolute left-1/2 top-2.5 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-noir/90 px-3 py-1.5 text-[11.5px] font-medium text-cream backdrop-blur-sm">
            {status === 'adding' ? 'Adding…' : 'Added to cart'}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-1.5 pb-0.5 pt-3">
        <h3 className="line-clamp-2 font-display text-[17px] font-semibold leading-snug tracking-tight text-ink">
          <Link to={`/product/${product._id}`} className="transition-colors hover:text-clay">
            {product.name}
          </Link>
        </h3>
        {rating && rating.count > 0 && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted">
            <Stars value={rating.average} />
            <span>
              {rating.average.toFixed(1)} ({rating.count})
            </span>
          </p>
        )}
        <p className="mt-auto flex items-baseline gap-2 pt-2.5">
          <span className="text-[15px] font-semibold text-ink">{formatPrice(product.price)}</span>
          {discount > 0 && (
            <span className="text-[12px] text-muted line-through">{formatPrice(product.compareAtPrice)}</span>
          )}
        </p>
        {product.availability === 'LOW_STOCK' && (
          <p className="mt-1 text-[11px] font-medium text-clay">Only a few left</p>
        )}
      </div>

      {!soldOut && picking ? (
        <div className="mt-3 flex h-9 w-full items-stretch overflow-hidden rounded-full border border-noir">
          {qty > 1 ? (
            <button
              type="button"
              onClick={() => setQty((n) => Math.max(1, n - 1))}
              disabled={status === 'adding'}
              aria-label="One less"
              className="flex w-8 shrink-0 items-center justify-center text-ink transition-colors hover:bg-noir/5 disabled:opacity-40"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPicking(false)}
              disabled={status === 'adding'}
              aria-label="Cancel"
              className="flex w-8 shrink-0 items-center justify-center text-muted transition-colors hover:bg-noir/5 hover:text-ink disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          <span
            className="flex flex-1 items-center justify-center text-[12.5px] font-semibold tabular-nums text-ink"
            aria-live="polite"
            aria-label={`Quantity ${qty}`}
          >
            {qty}
          </span>
          <button
            type="button"
            onClick={() => setQty((n) => Math.min(MAX_QTY, n + 1))}
            disabled={status === 'adding' || qty >= MAX_QTY}
            aria-label="One more"
            className="flex w-8 shrink-0 items-center justify-center text-ink transition-colors hover:bg-noir/5 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={status === 'adding'}
            aria-label={`Add ${qty} to cart`}
            className="flex w-10 shrink-0 items-center justify-center bg-noir text-cream transition-colors hover:bg-noir-soft disabled:opacity-60"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          disabled={soldOut || status === 'adding'}
          className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-noir text-[11px] font-semibold uppercase tracking-[0.1em] text-cream transition-all duration-200 hover:bg-noir-soft active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
        >
          {soldOut ? (
            'Unavailable'
          ) : status === 'adding' ? (
            'Adding…'
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add
            </>
          )}
        </button>
      )}
      {note && <p className="mt-2 px-1 text-[11px] text-clay">{note}</p>}
    </article>
  )
}
