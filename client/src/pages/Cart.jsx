import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import { useCart } from '../hooks/useCart'
import { useNearby } from '../hooks/useNearby'
import ProductImage from '../components/ProductImage'
import { Button, EmptyState, ErrorState, PageHeader, Skeleton, panel, shell } from '../design'
import { formatPrice } from '../ui'

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
  const { blockIds, areaName } = useNearby()
  // Which items the stores in the cart can still deliver to the shopping area (read-only check).
  const [areaCheck, setAreaCheck] = useState({ key: '', undeliverable: [] })

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

  const cartKey = cart ? cart.groups.flatMap((g) => g.items.map((i) => i.productId)).sort().join(',') : ''
  const checkKey = blockIds.length > 0 && cartKey ? `${blockIds.join(',')}|${cartKey}` : ''
  useEffect(() => {
    if (!checkKey) return undefined
    let active = true
    api
      .post('/cart/area-check', { blockIds })
      .then((res) => active && setAreaCheck({ key: checkKey, undeliverable: res.data.undeliverable }))
      .catch(() => active && setAreaCheck({ key: checkKey, undeliverable: [] }))
    return () => {
      active = false
    }
  }, [checkKey, blockIds])
  const undeliverable = areaCheck.key === checkKey ? areaCheck.undeliverable : []

  async function removeUndeliverable() {
    setBusyId('area')
    setNotice('')
    try {
      let res
      for (const item of undeliverable) res = await api.delete(`/cart/items/${item.productId}`)
      if (res) {
        setState({ loading: false, cart: res.data.cart, error: '' })
        setCount(res.data.cart.itemCount)
      }
    } catch (err) {
      setNotice(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="bg-canvas">
      <div className={`${shell} pb-16 pt-10 sm:pt-14`}>
        <PageHeader
          eyebrow="Your cart"
          title={
            !cart
              ? 'Review your items'
              : cart.itemCount === 0
                ? 'Nothing here yet.'
                : `${cart.itemCount} ${cart.itemCount === 1 ? 'item' : 'items'}`
          }
          accent={cart && cart.itemCount > 0 ? 'in your cart.' : undefined}
          lede="Each brand packs and delivers its own order. You pay each one in cash at the door."
        />

        {undeliverable.length > 0 && (
          <div role="alert" className="mt-7 rounded-card border border-clay/20 bg-clay/5 px-4 py-3.5 text-[13px] text-clay">
            <p className="font-semibold">
              {undeliverable.length === 1 ? 'One item cannot' : `${undeliverable.length} items cannot`} be delivered to {areaName || 'your area'}
            </p>
            <ul className="mt-1 list-disc pl-5">
              {undeliverable.map((u) => (
                <li key={u.productId}>
                  {u.name || 'An item that is no longer sold'}
                  {u.brandName ? ` (${u.brandName})` : ''}
                </li>
              ))}
            </ul>
            <div className="mt-2.5 flex flex-wrap gap-4 font-semibold">
              <button type="button" disabled={busyId === 'area'} onClick={removeUndeliverable} className="underline disabled:opacity-50">
                Remove {undeliverable.length === 1 ? 'it' : 'them'}
              </button>
              <Link to="/nearby" className="underline">
                Change area
              </Link>
            </div>
          </div>
        )}

        {loading && (
          <div className="mt-8 space-y-4">
            <Skeleton className="h-40 w-full rounded-card" />
            <Skeleton className="h-40 w-full rounded-card" />
          </div>
        )}

        {error && <ErrorState className="mt-8" title="We couldn't load your cart" message={error} />}

        {notice && (
          <p role="alert" className="mt-7 rounded-tile border border-clay/20 bg-clay/5 px-3.5 py-2.5 text-[12.5px] text-clay">
            {notice}
          </p>
        )}

        {cart && cart.groups.length === 0 && (
          <EmptyState
            className="mt-8"
            icon={ShoppingBag}
            title="Your cart is empty."
            message="Browse the stores near you and add a few things. Each one delivers to your door."
            action={
              <Button to="/nearby" tone="noir" size="md">
                Browse stores
              </Button>
            }
          />
        )}

        {cart && cart.groups.length > 0 && (
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem] lg:gap-10">
            <div className="space-y-5">
              {cart.groups.map((group) => (
                <section key={group.brand._id} className="overflow-hidden rounded-card border border-line-warm bg-paper-warm">
                  <div className="flex items-center justify-between gap-3 border-b border-line-warm bg-cream/50 px-5 py-3.5">
                    <h2>
                      <Link to={`/store/${group.brand._id}`} className="font-display text-[17px] font-semibold tracking-tight text-ink transition hover:text-clay">
                        {group.brand.name || 'Brand'}
                      </Link>
                    </h2>
                    <span className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-ink/40">Ships on its own</span>
                  </div>
                  <ul className="divide-y divide-line-warm">
                    {group.items.map((item) => (
                      <li key={item.productId} className="flex gap-4 p-4 sm:p-5">
                        <Link
                          to={`/product/${item.productId}`}
                          className="block w-[74px] shrink-0 overflow-hidden rounded-tile bg-sand"
                        >
                          <ProductImage src={item.image} name={item.name || ''} className="aspect-[4/5] w-full" />
                        </Link>
                        <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                          <div>
                            <Link
                              to={`/product/${item.productId}`}
                              className="text-[14.5px] font-medium leading-snug text-ink transition hover:text-clay"
                            >
                              {item.name || 'Unavailable product'}
                            </Link>
                            <p className="mt-1 text-[12.5px] text-ink/55">
                              {item.unitPrice != null ? formatPrice(item.unitPrice) : '—'} each
                            </p>
                            {item.issue && <p className="mt-1 text-[12px] font-medium text-clay">{issueText(item)}</p>}
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="inline-flex h-9 items-center overflow-hidden rounded-tile border border-line-warm bg-paper-warm">
                              <button
                                type="button"
                                aria-label={`Decrease quantity of ${item.name}`}
                                disabled={busyId === item.productId || item.quantity <= 1}
                                onClick={() => setQuantity(item.productId, item.quantity - 1)}
                                className="flex h-full w-9 items-center justify-center text-ink/55 transition hover:bg-sand hover:text-ink disabled:text-ink/25"
                              >
                                <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <span className="w-8 text-center text-[13px] font-semibold tabular-nums text-ink" aria-live="polite">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                aria-label={`Increase quantity of ${item.name}`}
                                disabled={busyId === item.productId || item.quantity >= MAX_QTY}
                                onClick={() => setQuantity(item.productId, item.quantity + 1)}
                                className="flex h-full w-9 items-center justify-center text-ink/55 transition hover:bg-sand hover:text-ink disabled:text-ink/25"
                              >
                                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                            <button
                              type="button"
                              disabled={busyId === item.productId}
                              onClick={() => remove(item.productId)}
                              aria-label={`Remove ${item.name}`}
                              className="flex h-9 w-9 items-center justify-center rounded-tile text-ink/40 transition hover:bg-clay/5 hover:text-danger disabled:opacity-40"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        <p className="shrink-0 text-[14px] font-semibold text-ink">{formatPrice(item.lineTotal)}</p>
                      </li>
                    ))}
                  </ul>
                  <p className="border-t border-line-warm bg-canvas/40 px-5 py-3 text-right text-[12.5px] text-ink/50">
                    {group.brand.name} subtotal{' '}
                    <span className="ml-2 text-[13px] font-semibold text-ink">{formatPrice(group.subtotal)}</span>
                  </p>
                </section>
              ))}
            </div>

            <aside className={`${panel} h-fit p-6 lg:sticky lg:top-24`}>
              <h2 className="font-display text-[21px] font-semibold tracking-tight text-ink">Summary</h2>
              <dl className="mt-5 space-y-3 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-ink/55">Items</dt>
                  <dd className="text-ink">{cart.itemCount}</dd>
                </div>
                <div className="flex justify-between border-t border-line-warm pt-3 text-[15px] font-semibold">
                  <dt className="text-ink">Subtotal</dt>
                  <dd className="text-ink">{formatPrice(cart.subtotal)}</dd>
                </div>
              </dl>
              <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-ink/50">
                <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-clay" aria-hidden="true" />
                Each brand prepares and delivers its own order. You pay in cash on delivery.
              </p>
              {hasIssues ? (
                <p className="mt-5 rounded-tile bg-clay/5 px-3.5 py-2.5 text-[12.5px] text-clay">
                  Remove or fix the items marked above to continue.
                </p>
              ) : (
                <Button to="/checkout" tone="primary" size="lg" className="mt-5 w-full">
                  Checkout
                </Button>
              )}
              <p className="mt-3 text-center text-[11.5px] text-ink/55">
                <Link to="/nearby" className="font-medium text-ink/70 transition hover:text-clay">
                  Keep shopping
                </Link>
              </p>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
