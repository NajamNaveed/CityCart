import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Minus,
  Package,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Truck,
} from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { useCart } from '../hooks/useCart'
import { usePageMeta } from '../hooks/usePageMeta'
import ProductImage from '../components/ProductImage'
import { optimizedUrl } from '../components/optimizeImage'
import ReviewsSection from '../components/ReviewsSection'
import AlsoSoldBy from '../components/nearby/AlsoSoldBy'
import Stars from '../components/Stars'
import { useProductReviews } from '../hooks/useProductReviews'
import { EmptyState } from '../design'
import { Modal, Reveal } from '../components/ui'
import { loginUrl } from '../utils/nav'
import { breadcrumbLd, productLd } from '../utils/seo'
import { btn, eyebrow, panel, shell } from '../design'
import { formatPrice } from '../ui'

const MAX_QTY = 10
// Matches the cart's own per-line ceiling, so the product page can edit any
// quantity the cart already holds.
const CART_MAX_QTY = 99

function quantityInCart(cart, productId) {
  for (const group of cart?.groups || []) {
    const item = group.items.find((i) => String(i.productId) === String(productId))
    if (item) return item.quantity
  }
  return 0
}

// Long text (descriptions, reviews) collapses behind a Read more toggle so one
// product's copy can never push the rest of the page out of reach.
function Clampable({ text, lines = 5, threshold = 320, className = '' }) {
  const [expanded, setExpanded] = useState(false)
  const clampable = text.length > threshold
  return (
    <div>
      <p
        className={className}
        style={
          clampable && !expanded
            ? { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
            : undefined
        }
      >
        {text}
      </p>
      {clampable && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[13px] font-medium text-clay underline-offset-4 hover:underline"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  )
}

const ASSURANCES = [
  { icon: Banknote, text: 'Pay cash when it arrives' },
  { icon: Truck, text: 'Follow every delivery step' },
  { icon: ShieldCheck, text: 'Reviews from real buyers' },
]

function ProductView({ product, brand }) {
  const { user } = useAuth()
  const { addItem, updateItem, removeItem } = useCart()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()

  const [qty, setQty] = useState(1)
  // null while the cart is being read, so the buy box never flashes "Add to
  // cart" for something the customer already has.
  const [cartQty, setCartQty] = useState(null)
  const [cartBusy, setCartBusy] = useState(false)
  const [shown, setShown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState({ type: '', text: '' })
  const [lightbox, setLightbox] = useState(false)
  const [zooming, setZooming] = useState(false)
  const [origin, setOrigin] = useState('50% 50%')
  const resumed = useRef(false)

  const isCustomer = user?.role === 'CUSTOMER'
  const soldOut = product.availability === 'OUT_OF_STOCK'
  const images = product.images?.length ? product.images : [null]
  const discount =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round((1 - product.price / product.compareAtPrice) * 100)
      : 0
  const details = Object.entries(product.attributes || {}).filter(([, v]) => v !== '' && v != null)
  const reviews = useProductReviews(product._id)

  async function add(quantity) {
    setBusy(true)
    setNotice({ type: '', text: '' })
    try {
      const cart = await addItem(product._id, quantity)
      const total = quantityInCart(cart, product._id)
      setCartQty(total)
      setNotice({ type: 'ok', text: `Added ${quantity} to your cart — ${total} in your cart now.` })
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  // The cart lives on the server, so a customer who comes back to this page
  // sees what they added until checkout.
  useEffect(() => {
    if (!isCustomer) return undefined
    let active = true
    api
      .get('/cart')
      .then((res) => active && setCartQty(quantityInCart(res.data.cart, product._id)))
      .catch(() => active && setCartQty(0))
    return () => {
      active = false
    }
  }, [isCustomer, product._id])

  async function changeCartQuantity(next) {
    setCartBusy(true)
    setNotice({ type: '', text: '' })
    try {
      const cart = await updateItem(product._id, next)
      setCartQty(quantityInCart(cart, product._id))
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err) })
    } finally {
      setCartBusy(false)
    }
  }

  async function removeFromCart() {
    setCartBusy(true)
    setNotice({ type: '', text: '' })
    try {
      await removeItem(product._id)
      setCartQty(0)
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err) })
    } finally {
      setCartBusy(false)
    }
  }

  // Coming back from sign-in with ?add=N: finish the add the visitor started.
  useEffect(() => {
    const wanted = Number(params.get('add'))
    if (!wanted || !isCustomer || resumed.current) return
    resumed.current = true
    setParams({}, { replace: true })
    add(Math.min(Math.max(wanted, 1), MAX_QTY))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCustomer])

  function onAddClick() {
    if (!user) {
      navigate(loginUrl(`${location.pathname}?add=${qty}`))
      return
    }
    if (!isCustomer) {
      setNotice({
        type: 'error',
        text: 'Brand and admin accounts cannot place orders. Sign in with a customer account to shop.',
      })
      return
    }
    add(qty)
  }

  function trackOrigin(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    setOrigin(`${((e.clientX - rect.left) / rect.width) * 100}% ${((e.clientY - rect.top) / rect.height) * 100}%`)
  }

  return (
    <>
      <div className="bg-canvas">
        <div className={`${shell} py-6 sm:py-8`}>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] text-ink/45">
            <Link to="/" className="transition hover:text-ink">
              Home
            </Link>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <Link to="/nearby" className="transition hover:text-ink">
              Stores
            </Link>
            {brand && (
              <>
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
                <Link to={`/store/${brand._id}`} className="max-w-40 truncate transition hover:text-ink">
                  {brand.name}
                </Link>
              </>
            )}
          </nav>

          <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-14">
            {/* Gallery */}
            <div>
              <div
                className="group relative overflow-hidden rounded-panel bg-sand"
                onMouseEnter={() => setZooming(true)}
                onMouseLeave={() => setZooming(false)}
                onMouseMove={trackOrigin}
              >
                <div
                  className={`transition-transform duration-300 ease-out ${zooming ? 'scale-[1.7]' : 'scale-100'}`}
                  style={{ transformOrigin: origin }}
                >
                  <ProductImage src={images[shown]} name={product.name} className="aspect-[4/5] w-full" />
                </div>
                {images[shown] && (
                  <button
                    type="button"
                    onClick={() => setLightbox(true)}
                    aria-label="View full image"
                    className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-tile border border-white/50 bg-cream/90 text-ink shadow-sm backdrop-blur transition hover:bg-cream"
                  >
                    <Plus className="h-4 w-4 rotate-45" aria-hidden="true" />
                  </button>
                )}
                {discount > 0 && (
                  <span className="absolute left-4 top-4 rounded-full bg-clay px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white">
                    {discount}% off
                  </span>
                )}
              </div>

              {images.length > 1 && (
                <div className="mt-3 grid grid-cols-5 gap-3">
                  {images.map((src, i) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setShown(i)}
                      aria-label={`Show image ${i + 1}`}
                      aria-pressed={i === shown}
                      className={`overflow-hidden rounded-tile transition ${
                        i === shown ? 'ring-2 ring-noir ring-offset-2 ring-offset-canvas' : 'opacity-70 hover:opacity-100'
                      }`}
                    >
                      <ProductImage src={src} name={product.name} className="aspect-square w-full" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Buy box */}
            <div className="lg:pt-2">
              {brand && (
                <Link to={`/store/${brand._id}`} className={`${eyebrow} transition hover:text-clay`}>
                  {brand.name}
                </Link>
              )}
              <h1 className="font-display mt-3 text-[32px] font-semibold leading-[1.05] tracking-[-0.02em] text-ink sm:text-[42px]">
                {product.name}
              </h1>

              {reviews.summary.count > 0 && (
                <a href="#reviews" className="mt-3 inline-flex items-center gap-2 text-[13px] transition hover:text-clay">
                  <Stars value={reviews.summary.average} />
                  <span className="font-medium">{reviews.summary.average.toFixed(1)}</span>
                  <span className="text-muted">
                    ({reviews.summary.count} {reviews.summary.count === 1 ? 'review' : 'reviews'})
                  </span>
                </a>
              )}

              <p className="mt-5 flex items-baseline gap-3">
                <span className="text-[28px] font-semibold text-ink">{formatPrice(product.price)}</span>
                {discount > 0 && (
                  <>
                    <span className="text-base text-muted line-through">{formatPrice(product.compareAtPrice)}</span>
                    <span className="text-[13px] font-medium text-clay">{discount}% off</span>
                  </>
                )}
              </p>

              <p
                className={`mt-3 inline-flex items-center gap-2 text-[13px] ${
                  soldOut ? 'text-clay' : product.availability === 'LOW_STOCK' ? 'text-clay' : 'text-ink/55'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${soldOut ? 'bg-clay' : product.availability === 'LOW_STOCK' ? 'bg-warning' : 'bg-success'}`}
                />
                {soldOut ? 'Sold out' : product.availability === 'LOW_STOCK' ? 'Only a few left' : 'In stock'}
              </p>

              {product.description && (
                <Clampable
                  text={product.description}
                  lines={5}
                  className="mt-6 whitespace-pre-line text-[14px] leading-relaxed text-ink/65"
                />
              )}

              {isCustomer && cartQty === null ? (
                <div className="mt-8 h-[76px] w-full animate-pulse rounded-tile bg-sand" aria-hidden="true" />
              ) : isCustomer && cartQty > 0 ? (
                <div className={`mt-8 ${panel} p-4`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] text-ink/60">
                      <span className="text-[15px] font-semibold text-ink">{cartQty}</span> in your cart
                    </p>
                    <button
                      type="button"
                      onClick={removeFromCart}
                      disabled={cartBusy}
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink/50 transition hover:text-clay disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
                    <div className="inline-flex h-10 items-center overflow-hidden rounded-tile border border-line-warm bg-paper-warm">
                      <button
                        type="button"
                        aria-label="Decrease cart quantity"
                        onClick={() => changeCartQuantity(cartQty - 1)}
                        className="flex h-full w-10 items-center justify-center text-ink/50 transition hover:text-ink disabled:text-ink/20"
                        disabled={cartBusy || soldOut || cartQty <= 1}
                      >
                        <Minus className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <span className="w-9 text-center text-[13px] font-semibold text-ink" aria-live="polite">
                        {cartQty}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase cart quantity"
                        onClick={() => changeCartQuantity(cartQty + 1)}
                        className="flex h-full w-10 items-center justify-center text-ink/50 transition hover:text-ink disabled:text-ink/20"
                        disabled={cartBusy || soldOut || cartQty >= CART_MAX_QTY}
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <span className="text-[12.5px] text-muted">{formatPrice(product.price)} each</span>
                    <Link to="/cart" className="ml-auto text-[12.5px] font-medium text-clay underline-offset-4 hover:underline">
                      View cart
                    </Link>
                  </div>
                  {soldOut && <p className="mt-2 text-[12px] text-clay">This product is sold out — remove it or wait for a restock.</p>}
                  {cartBusy && (
                    <p className="mt-2 text-[12px] text-muted" role="status">
                      Updating your cart…
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-8 flex items-center gap-3">
                  <div className="inline-flex h-12 items-center overflow-hidden rounded-tile border border-line-warm bg-paper-warm">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      className="flex h-full w-11 items-center justify-center text-ink/50 transition hover:text-ink disabled:text-ink/20"
                      disabled={qty <= 1}
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <span className="w-8 text-center text-[13px] font-semibold text-ink" aria-live="polite">
                      {qty}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
                      className="flex h-full w-11 items-center justify-center text-ink/50 transition hover:text-ink disabled:text-ink/20"
                      disabled={qty >= MAX_QTY}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={onAddClick}
                    disabled={soldOut || busy}
                    className={`${btn('noir', 'lg')} flex-1`}
                  >
                    {soldOut ? (
                      'Sold out'
                    ) : (
                      <>
                        <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                        {busy ? 'Adding…' : 'Add to cart'}
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* The conversation happens on its own page; a visitor is asked to sign in first. */}
              {brand && (!user || user.role === 'CUSTOMER') && (
                <Link
                  to={`/chat?product=${product._id}`}
                  className={`mt-3 w-full ${btn('outline', 'lg')}`}
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Chat with seller
                </Link>
              )}

              {notice.text && (
                <p
                  className={`mt-4 rounded-tile border px-3.5 py-2.5 text-[13px] ${
                    notice.type === 'ok' ? 'border-sage bg-sage/40 text-forest' : 'border-clay/20 bg-clay/5 text-clay'
                  }`}
                  role="status"
                >
                  {notice.text}
                  {notice.type === 'ok' && (
                    <>
                      {' '}
                      <Link to="/cart" className="font-medium underline underline-offset-4">
                        View cart
                      </Link>
                    </>
                  )}
                </p>
              )}

              <ul className="mt-7 space-y-2.5 border-t border-line-warm pt-6">
                {ASSURANCES.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-2.5 text-[13px] text-ink/60">
                    <Icon className="h-4 w-4 text-clay" aria-hidden="true" />
                    {text}
                  </li>
                ))}
              </ul>

              {(details.length > 0 || product.sku) && (
                <dl className={`mt-6 divide-y divide-line-warm ${panel} px-5 text-[13px]`}>
                  {details.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-6 py-3">
                      <dt className="text-ink/50">{k}</dt>
                      <dd className="text-right text-ink">{String(v)}</dd>
                    </div>
                  ))}
                  {product.sku && (
                    <div className="flex justify-between gap-6 py-3">
                      <dt className="text-ink/50">SKU</dt>
                      <dd className="text-ink">{product.sku}</dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          </div>

          <AlsoSoldBy catalogProductId={product.catalogProductId} currentProductId={product._id} />
        </div>
      </div>

      <ReviewsSection data={reviews} />

      {/* Full-screen image viewer — height-capped so the whole photo always
          fits on screen, whatever its shape or the viewport size. */}
      <Modal open={lightbox} onClose={() => setLightbox(false)} maxWidth="max-w-4xl" title={product.name}>
        <img
          src={optimizedUrl(images[shown], 1600)}
          alt={product.name}
          className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg bg-sand object-contain"
        />
        {images.length > 1 && (
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous image"
              onClick={() => setShown((s) => (s - 1 + images.length) % images.length)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-line transition hover:border-ink"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[13px] text-muted">
              {shown + 1} / {images.length}
            </span>
            <button
              type="button"
              aria-label="Next image"
              onClick={() => setShown((s) => (s + 1) % images.length)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-line transition hover:border-ink"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </Modal>
    </>
  )
}

export default function ProductDetail() {
  const { id } = useParams()
  const [data, setData] = useState({ id: null, product: null, brand: null, error: '' })

  useEffect(() => {
    let active = true
    api
      .get(`/products/${id}`)
      .then(async (res) => {
        const product = res.data.product
        let brand = null
        try {
          brand = (await api.get(`/brands/${product.brandId}`)).data.brand
        } catch {
          /* the page still works without the brand header */
        }
        if (active) setData({ id, product, brand, error: '' })
      })
      .catch((err) => {
        if (!active) return
        const gone = err.response?.status === 404 || err.response?.status === 400
        setData({ id, product: null, brand: null, error: gone ? 'This product is not available.' : getErrorMessage(err) })
      })
    return () => {
      active = false
    }
  }, [id])

  const product = data.id === id ? data.product : null
  const brand = data.id === id ? data.brand : null

  usePageMeta({
    title: product ? product.name : 'Product',
    description: product?.description ? product.description.slice(0, 160) : undefined,
    image: product?.images?.[0],
    type: 'product',
    noindex: data.id === id && !data.product,
    jsonLd: product
      ? [
          productLd({ product, brand, path: `/product/${id}` }),
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Stores', path: '/nearby' },
            { name: brand?.name || 'Store', path: `/store/${product.brandId}` },
            { name: product.name, path: `/product/${id}` },
          ]),
        ]
      : null,
  })

  if (data.id !== id) {
    return (
      <div className="bg-canvas">
        <div className={`${shell} grid gap-10 py-12 lg:grid-cols-2`}>
          <div className="aspect-[4/5] animate-pulse rounded-panel bg-sand" />
          <div className="space-y-4 pt-2">
            <div className="h-3.5 w-24 animate-pulse rounded bg-sand" />
            <div className="h-10 w-3/4 animate-pulse rounded bg-sand" />
            <div className="h-6 w-32 animate-pulse rounded bg-sand" />
            <div className="h-12 w-full animate-pulse rounded bg-sand" />
          </div>
        </div>
      </div>
    )
  }

  if (!data.product) {
    return (
      <div className="bg-canvas">
        <div className={`${shell} py-16`}>
          <EmptyState
            icon={Package}
            title={data.error}
            message="It may have been removed, or the link is wrong."
            action={
              <Link to="/nearby" className={btn('noir', 'md')}>
                Back to stores near you
              </Link>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <Reveal>
      <ProductView key={data.product._id} product={data.product} brand={data.brand} />
    </Reveal>
  )
}
