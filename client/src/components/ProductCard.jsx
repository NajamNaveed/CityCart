import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import ProductImage from './ProductImage'
import { useAuth } from '../hooks/useAuth'
import { useCart } from '../hooks/useCart'
import { getErrorMessage } from '../services/api'
import { loginUrl } from '../utils/nav'
import { formatPrice } from '../ui'

export default function ProductCard({ product, brandName }) {
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
    <article className="group flex flex-col">
      <Link to={`/product/${product._id}`} className="block">
        <div className="relative overflow-hidden bg-sand">
          <ProductImage
            src={product.images?.[0]}
            name={product.name}
            className="aspect-[4/5] w-full transition duration-500 group-hover:scale-[1.03]"
          />
          {soldOut && (
            <span className="absolute left-3 top-3 bg-ink px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-cream">
              Sold out
            </span>
          )}
          {!soldOut && discount > 0 && (
            <span className="absolute left-3 top-3 bg-clay px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-cream">
              {discount}% off
            </span>
          )}
        </div>
        <div className="mt-3">
          {brandName && (
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{brandName}</p>
          )}
          <h3 className="mt-1 line-clamp-2 text-[15px] font-medium leading-snug">{product.name}</h3>
          <p className="mt-1.5 flex items-baseline gap-2 text-[15px]">
            <span className="font-semibold">{formatPrice(product.price)}</span>
            {discount > 0 && (
              <span className="text-[13px] text-muted line-through">{formatPrice(product.compareAtPrice)}</span>
            )}
          </p>
          {product.availability === 'LOW_STOCK' && (
            <p className="mt-1 text-xs text-clay">Only a few left</p>
          )}
        </div>
      </Link>

      <button
        type="button"
        onClick={onAdd}
        disabled={soldOut || status === 'adding'}
        className="mt-3 h-10 w-full rounded-sm border border-ink text-[12px] font-medium uppercase tracking-[0.1em] transition hover:bg-ink hover:text-cream disabled:cursor-not-allowed disabled:border-line disabled:text-muted disabled:hover:bg-transparent disabled:hover:text-muted"
      >
        {soldOut ? 'Unavailable' : status === 'adding' ? 'Adding…' : status === 'added' ? 'Added to cart' : 'Add to cart'}
      </button>
      {note && <p className="mt-2 text-xs text-clay">{note}</p>}
    </article>
  )
}