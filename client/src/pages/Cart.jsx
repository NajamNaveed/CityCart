import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { getErrorMessage } from '../services/api'
import { useCart } from '../hooks/useCart'
import ProductImage from '../components/ProductImage'
import { btnPrimary, formatPrice, wrap } from '../ui'

const ISSUES = {
  PRODUCT_UNAVAILABLE: 'No longer available',
  BRAND_UNAVAILABLE: 'This brand is unavailable',
  OUT_OF_STOCK: 'Out of stock',
}

const issueText = (item) =>
  item.issue === 'INSUFFICIENT_STOCK' ? `Only ${item.availableQuantity} available` : ISSUES[item.issue]

// Read-only cart for now: quantity editing and checkout arrive in the next step.
export default function Cart() {
  const { setCount } = useCart()
  const [state, setState] = useState({ loading: true, cart: null, error: '' })

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

  async function remove(productId) {
    try {
      const res = await api.delete(`/cart/items/${productId}`)
      setState({ loading: false, cart: res.data.cart, error: '' })
      setCount(res.data.cart.itemCount)
    } catch (err) {
      setState((s) => ({ ...s, error: getErrorMessage(err) }))
    }
  }

  const { loading, cart, error } = state

  return (
    <div className={`${wrap} py-10`}>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your cart</h1>

      {loading && <div className="mt-8 h-40 animate-pulse bg-sand" />}
      {error && <p className="mt-6 text-clay">{error}</p>}

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
                      <div className="flex flex-1 flex-col justify-between">
                        <div>
                          <Link to={`/product/${item.productId}`} className="text-[15px] font-medium hover:text-clay">
                            {item.name || 'Unavailable product'}
                          </Link>
                          <p className="mt-1 text-sm text-muted">
                            {item.quantity} × {item.unitPrice != null ? formatPrice(item.unitPrice) : '—'}
                          </p>
                          {item.issue && <p className="mt-1 text-sm text-clay">{issueText(item)}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(item.productId)}
                          className="self-start text-[13px] text-muted underline underline-offset-4 hover:text-clay"
                        >
                          Remove
                        </button>
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
            <button type="button" disabled className={`${btnPrimary} mt-5 w-full`}>
              Checkout
            </button>
          </aside>
        </div>
      )}
    </div>
  )
}