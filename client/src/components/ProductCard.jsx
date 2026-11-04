import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Check, Minus, Plus, ShoppingBag, X } from 'lucide-react'
import ProductImage from './ProductImage'
import Stars from './Stars'
import { useAuth } from '../hooks/useAuth'
import { useCart } from '../hooks/useCart'
import { getErrorMessage } from '../services/api'
import { loginUrl } from '../utils/nav'
import { formatPrice } from '../ui'

// Same per-add ceiling as the product page.
const MAX_QTY = 10

export default function ProductCard({ product, brandName, rating }) {
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
    <article className="group flex h-full flex-col">
      <div className="relative overflow-hidden rounded-lg bg-sand">
        <Link to={`/product/${product._id}`} className="block" aria-label={product.name}>
          <ProductImage
            src={product.images?.[0]}
            name={product.name}
            className="aspect-[4/5] w-full transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        </Link>
        {soldOut && (
          <span className="absolute left-3 top-3 rounded-md bg-ink/90 px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-white backdrop-blur-sm">
            Sold out
          </span>
        )}
        {!soldOut && discount > 0 && (
          <span className="absolute left-3 top-3 rounded-md bg-clay px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white">
            {discount}% off
          </span>
        )}
        {!soldOut && status !== 'idle' && user?.role === 'CUSTOMER' && (
          <span className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink/90 px-3.5 py-1.5 text-[12px] font-medium text-white backdrop-blur-sm">
            <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
            {status === 'adding' ? 'Adding…' : 'Added to cart'}
          </span>
        )}
      </div>

      <div className="mt-3.5 flex flex-1 flex-col">
        {brandName && (
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{brandName}</p>
        )}
        <h3 className="mt-1 line-clamp-2 text-[14.5px] font-medium leading-snug text-ink">
          <Link to={`/product/${product._id}`} className="transition-colors hover:text-clay">
            {product.name}
          </Link>
        </h3>
        {rating && rating.count > 0 && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
            <Stars value={rating.average} />
            <span>
              {rating.average.toFixed(1)} ({rating.count})
            </span>
          </p>
        )}
        <p className="mt-auto flex items-baseline gap-2 pt-2 text-[15px]">
          <span className="font-semibold text-ink">{formatPrice(product.price)}</span>
          {discount > 0 && (
            <span className="text-[13px] text-muted line-through">{formatPrice(product.compareAtPrice)}</span>
          )}
        </p>
        {product.availability === 'LOW_STOCK' && (
          <p className="mt-1 text-xs font-medium text-clay">Only a few left</p>
        )}
      </div>

      {!soldOut && picking ? (
        <div className="mt-3 flex h-10 w-full items-stretch overflow-hidden rounded-md border border-ink/80">
          {qty > 1 ? (
            <button
              type="button"
              onClick={() => setQty((n) => Math.max(1, n - 1))}
              disabled={status === 'adding'}
              aria-label="One less"
              className="flex w-9 shrink-0 items-center justify-center text-ink transition-colors hover:bg-ink/5 disabled:opacity-40"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPicking(false)}
              disabled={status === 'adding'}
              aria-label="Cancel"
              className="flex w-9 shrink-0 items-center justify-center text-muted transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          <span className="flex flex-1 items-center justify-center text-[13px] font-semibold tabular-nums text-ink" aria-live="polite" aria-label={`Quantity ${qty}`}>
            {qty}
          </span>
          <button
            type="button"
            onClick={() => setQty((n) => Math.min(MAX_QTY, n + 1))}
            disabled={status === 'adding' || qty >= MAX_QTY}
            aria-label="One more"
            className="flex w-9 shrink-0 items-center justify-center text-ink transition-colors hover:bg-ink/5 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={status === 'adding'}
            aria-label={`Add ${qty} to cart`}
            className="flex w-11 shrink-0 items-center justify-center bg-ink text-white transition-colors hover:bg-ink-soft disabled:opacity-60"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          disabled={soldOut || status === 'adding'}
          className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-ink/80 text-[12px] font-medium uppercase tracking-[0.1em] text-ink transition-all duration-200 hover:bg-ink hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:border-line disabled:text-muted disabled:hover:bg-transparent disabled:hover:text-muted"
        >
          {soldOut ? (
            'Unavailable'
          ) : status === 'adding' ? (
            'Adding…'
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add to cart
            </>
          )}
        </button>
      )}
      {note && <p className="mt-2 text-xs text-clay">{note}</p>}
    </article>
  )
}
