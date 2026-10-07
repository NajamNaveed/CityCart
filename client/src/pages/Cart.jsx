import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import { useCart } from '../hooks/useCart'
import ProductImage from '../components/ProductImage'
import { EmptyState, Skeleton } from '../components/ui'
import { btnPrimary, formatPrice, wrap } from '../ui'

const MAX_QTY = 99

const ISSUES = {
  PRODUCT_UNAVAILABLE: 'No longer available',
  BRAND_UNAVAILABLE: 'This brand is unavailable',
  OUT_OF_STOCK: 'Out of stock',
}

const issueText = (item) =>
  item.issue === 'INSUFFICIENT_STOCK' ? `Only ${item.availableQuantity} available` : ISSUES[item.issue]

export default function Cart() {
  const { setCount } = useCart()
  const [state, setState] = useState({ loading: true, cart: null, error: '' })
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    api
      .get('/cart')
      .then((res) => {
        if (!active) return
        setState({ loading: false, cart: res.data.cart, error: '' })
        setCount(res.data.cart.itemCount)
      })
      .catch((err) => active && setState({ loading: false, cart: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [setCount])

  // One place for every cart change: show the server's fresh cart, or its error.
  async function change(productId, request) {
    setBusyId(productId)
    setNotice('')
    try {
      const res = await request()
      setState({ loading: false, cart: res.data.cart, error: '' })
      setCount(res.data.cart.itemCount)
    } catch (err) {
      setNotice(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const setQuantity = (productId, quantity) =>
    change(productId, () => api.patch(`/cart/items/${productId}`, { quantity }))
  const remove = (productId) => change(productId, () => api.delete(`/cart/items/${productId}`))

  const { loading, cart, error } = state
  const hasIssues = cart?.groups.some((g) => g.items.some((i) => i.issue))

  return (
    <div className={`${wrap} py-10`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Your cart</p>
      <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {cart ? `${cart.itemCount} ${cart.itemCount === 1 ? 'item' : 'items'}` : 'Review your items'}
      </h1>

      {loading && (
        <div className="mt-8 space-y-4">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      )}
      {error && <p className="mt-6 text-clay">{error}</p>}
      {notice && (
        <p role="alert" className="mt-6 rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">
          {notice}
        </p>
      )}

      {cart && cart.groups.length === 0 && (
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty."
          message="Browse the marketplace and add products from the brands in your city."
          className="py-20"
          action={
            <Link to="/shop" className={btnPrimary}>
              Start shopping
            </Link>
          }
        />
      )}

      {cart && cart.groups.length > 0 && (
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-6">
            {cart.groups.map((group) => (
              <section key={group.brand._id} className="overflow-hidden rounded-lg border border-line bg-white">
                <h2 className="border-b border-line bg-paper px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
                  {group.brand.name || 'Brand'}
                </h2>
                <ul className="divide-y divide-line">
                  {group.items.map((item) => (
                    <li key={item.productId} className="flex gap-4 p-5">
                      <Link
                        to={`/product/${item.productId}`}
                        className="block w-20 shrink-0 overflow-hidden rounded-md bg-sand"
                      >
                        <ProductImage src={item.image} name={item.name || ''} className="aspect-[4/5] w-full" />
                      </Link>
                      <div className="flex flex-1 flex-col justify-between gap-3">
                        <div>
                          <Link
                            to={`/product/${item.productId}`}
                            className="text-[15px] font-medium text-ink transition hover:text-clay"
                          >
                            {item.name || 'Unavailable product'}
                          </Link>
                          <p className="mt-1 text-[13px] text-muted">
                            {item.unitPrice != null ? formatPrice(item.unitPrice) : '—'} each
                          </p>
                          {item.issue && <p className="mt-1 text-[13px] font-medium text-clay">{issueText(item)}</p>}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="inline-flex h-9 items-center rounded-md border border-line">
                            <button
                              type="button"
                              aria-label={`Decrease quantity of ${item.name}`}
                              disabled={busyId === item.productId || item.quantity <= 1}
                              onClick={() => setQuantity(item.productId, item.quantity - 1)}
                              className="flex h-full w-9 items-center justify-center text-muted transition hover:text-ink disabled:text-muted/40"
                            >
                              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <span className="w-8 text-center text-sm font-semibold text-ink" aria-live="polite">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label={`Increase quantity of ${item.name}`}
                              disabled={busyId === item.productId || item.quantity >= MAX_QTY}
                              onClick={() => setQuantity(item.productId, item.quantity + 1)}
                              className="flex h-full w-9 items-center justify-center text-muted transition hover:text-ink disabled:text-muted/40"
                            >
                              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                          <button
                            type="button"
                            disabled={busyId === item.productId}
                            onClick={() => remove(item.productId)}
                            aria-label={`Remove ${item.name}`}
                            className="flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-clay/5 hover:text-danger disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <p className="text-[15px] font-semibold text-ink">{formatPrice(item.lineTotal)}</p>
                    </li>
                  ))}
                </ul>
                <p className="border-t border-line px-5 py-3 text-right text-[13px] text-muted">
                  {group.brand.name} subtotal{' '}
                  <span className="ml-2 font-semibold text-ink">{formatPrice(group.subtotal)}</span>
                </p>
              </section>
            ))}
          </div>

          <aside className="h-fit rounded-lg border border-line bg-white p-6 lg:sticky lg:top-24">
            <h2 className="font-display text-lg font-semibold text-ink">Summary</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Items</dt>
                <dd className="text-ink">{cart.itemCount}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
                <dt className="text-ink">Subtotal</dt>
                <dd className="text-ink">{formatPrice(cart.subtotal)}</dd>
              </div>
            </dl>
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
              <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-ink/60" aria-hidden="true" />
              Each brand prepares and delivers its own order. You pay in cash on delivery.
            </p>
            {hasIssues ? (
              <p className="mt-5 rounded-md bg-clay/5 px-3.5 py-2.5 text-[13px] text-clay">
                Remove or fix the items marked above to continue.
              </p>
            ) : (
              <Link to="/checkout" className={`${btnPrimary} mt-5 w-full`}>
                Checkout
              </Link>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
