import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { getErrorMessage } from '../services/api'
import { useCart } from '../hooks/useCart'
import ProductImage from '../components/ProductImage'
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
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your cart</h1>

      {loading && <div className="mt-8 h-40 animate-pulse bg-sand" />}
      {error && <p className="mt-6 text-clay">{error}</p>}
      {notice && (
        <p role="alert" className="mt-6 border-l-2 border-clay bg-sand px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      {cart && cart.groups.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-lg font-medium">Your cart is empty.</p>
          <Link to="/shop" className={`${btnPrimary} mt-6`}>
            Start shopping
          </Link>
        </div>
      )}

      {cart && cart.groups.length > 0 && (
        <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-10">
            {cart.groups.map((group) => (
              <section key={group.brand._id}>
                <h2 className="border-b border-line pb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
                  {group.brand.name || 'Brand'}
                </h2>
                <ul className="divide-y divide-line">
                  {group.items.map((item) => (
                    <li key={item.productId} className="flex gap-4 py-5">
                      <Link to={`/product/${item.productId}`} className="block w-20 shrink-0 overflow-hidden bg-sand">
                        <ProductImage src={item.image} name={item.name || ''} className="aspect-[4/5] w-full" />
                      </Link>
                      <div className="flex flex-1 flex-col justify-between gap-3">
                        <div>
                          <Link to={`/product/${item.productId}`} className="text-[15px] font-medium hover:text-clay">
                            {item.name || 'Unavailable product'}
                          </Link>
                          <p className="mt-1 text-sm text-muted">{item.unitPrice != null ? formatPrice(item.unitPrice) : '—'} each</p>
                          {item.issue && <p className="mt-1 text-sm text-clay">{issueText(item)}</p>}
                        </div>
                        <div className="flex items-center gap-5">
                          <div className="inline-flex h-9 items-center border border-line bg-paper">
                            <button
                              type="button"
                              aria-label={`Decrease quantity of ${item.name}`}
                              disabled={busyId === item.productId || item.quantity <= 1}
                              onClick={() => setQuantity(item.productId, item.quantity - 1)}
                              className="h-full w-9 hover:bg-sand disabled:text-muted disabled:hover:bg-transparent"
                            >
                              −
                            </button>
                            <span className="w-9 text-center text-sm font-medium" aria-live="polite">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label={`Increase quantity of ${item.name}`}
                              disabled={busyId === item.productId || item.quantity >= MAX_QTY}
                              onClick={() => setQuantity(item.productId, item.quantity + 1)}
                              className="h-full w-9 hover:bg-sand disabled:text-muted disabled:hover:bg-transparent"
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            disabled={busyId === item.productId}
                            onClick={() => remove(item.productId)}
                            className="text-[13px] text-muted underline underline-offset-4 hover:text-clay"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <p className="text-[15px] font-semibold">{formatPrice(item.lineTotal)}</p>
                    </li>
                  ))}
                </ul>
                <p className="text-right text-sm text-muted">
                  {group.brand.name} subtotal <span className="ml-2 font-medium text-ink">{formatPrice(group.subtotal)}</span>
                </p>
              </section>
            ))}
          </div>

          <aside className="h-fit border border-line bg-paper p-6">
            <h2 className="text-lg font-semibold">Summary</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Items</dt>
                <dd>{cart.itemCount}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
                <dt>Subtotal</dt>
                <dd>{formatPrice(cart.subtotal)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Each brand prepares and delivers its own order. You pay in cash on delivery.
            </p>
            {hasIssues ? (
              <p className="mt-5 text-sm text-clay">Remove or fix the items marked above to continue.</p>
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