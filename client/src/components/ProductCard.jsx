import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Plus, ShoppingBag } from 'lucide-react'
import ProductImage from './ProductImage'
import Stars from './Stars'
import { useAuth } from '../hooks/useAuth'
import { useCart } from '../hooks/useCart'
import { getErrorMessage } from '../services/api'
import { loginUrl } from '../utils/nav'
import { formatPrice } from '../ui'

export default function ProductCard({ product, brandName, rating }) {
  const { user } = useAuth()
  const { addItem } = useCart()
  const navigate = useNavigate()
  const location = useLocation()
  const [status, setStatus] = useState('idle') // idle | adding | added
  const [note, setNote] = useState('')

  const soldOut = product.availability === 'OUT_OF_STOCK'
  const discount =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round((1 - product.price / product.compareAtPrice) * 100)
      : 0

  async function onAdd() {
    // Guests are asked to sign in and then land back on this exact page.
    if (!user) {
      navigate(loginUrl(location.pathname + location.search))
      return
    }
    if (user.role !== 'CUSTOMER') {
      setNote('Sign in with a customer account to shop.')
      return
    }
    setStatus('adding')
    setNote('')
    try {
      await addItem(product._id, 1)
      setStatus('added')
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

      <button
        type="button"
        onClick={onAdd}
        disabled={soldOut || status === 'adding'}
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-ink/80 text-[12px] font-medium uppercase tracking-[0.1em] text-ink transition-all duration-200 hover:bg-ink hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:border-line disabled:text-muted disabled:hover:bg-transparent disabled:hover:text-muted"
      >
        {soldOut ? (
          'Unavailable'
        ) : status === 'idle' ? (
          <>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add to cart
          </>
        ) : (
          'Adding…'
        )}
      </button>
      {note && <p className="mt-2 text-xs text-clay">{note}</p>}
    </article>
  )
}
