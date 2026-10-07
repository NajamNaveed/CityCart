import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  Minus,
  Package,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { useCart } from '../hooks/useCart'
import ProductImage from '../components/ProductImage'
import { optimizedUrl } from '../components/optimizeImage'
import ReviewsSection from '../components/ReviewsSection'
import Stars from '../components/Stars'
import { useProductReviews } from '../hooks/useProductReviews'
import { EmptyState, Modal, Reveal } from '../components/ui'
import { loginUrl } from '../utils/nav'
import { btnPrimary, formatPrice, sectionLabel, wrap } from '../ui'

const MAX_QTY = 10

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
  const { addItem } = useCart()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()

  const [qty, setQty] = useState(1)
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
      await addItem(product._id, quantity)
      setNotice({ type: 'ok', text: 'Added to your cart.' })
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err) })
    } finally {
      setBusy(false)
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
      <div className={`${wrap} py-8`}>
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-muted">
          <Link to="/" className="transition hover:text-ink">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <Link to="/shop" className="transition hover:text-ink">
            Shop
          </Link>
          {brand && (
            <>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="max-w-40 truncate">{brand.name}</span>
            </>
          )}
        </nav>

        <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-14">
          {/* Gallery */}
          <div>
            <div
              className="group relative overflow-hidden rounded-lg bg-sand"
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
                  className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-md bg-white/90 text-ink shadow-sm backdrop-blur transition hover:bg-white"
                >
                  <Plus className="h-4 w-4 rotate-45" aria-hidden="true" />
                </button>
              )}
              {discount > 0 && (
                <span className="absolute left-4 top-4 rounded-md bg-clay px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white">
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
                    className={`overflow-hidden rounded-md transition ${
                      i === shown ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper' : 'opacity-70 hover:opacity-100'
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
              <Link to={`/shop?brandId=${brand._id}`} className={`${sectionLabel} transition hover:text-clay`}>
                {brand.name}
              </Link>
            )}
            <h1 className="font-display mt-3 text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
              {product.name}
            </h1>

            {reviews.summary.count > 0 && (
              <a href="#reviews" className="mt-3 inline-flex items-center gap-2 text-sm transition hover:text-clay">
                <Stars value={reviews.summary.average} />
                <span className="font-medium">{reviews.summary.average.toFixed(1)}</span>
                <span className="text-muted">
                  ({reviews.summary.count} {reviews.summary.count === 1 ? 'review' : 'reviews'})
                </span>
              </a>
            )}

            <p className="mt-5 flex items-baseline gap-3">
              <span className="text-[26px] font-semibold text-ink">{formatPrice(product.price)}</span>
              {discount > 0 && (
                <>
                  <span className="text-base text-muted line-through">{formatPrice(product.compareAtPrice)}</span>
                  <span className="text-sm font-medium text-clay">{discount}% off</span>
                </>
              )}
            </p>

            <p
              className={`mt-3 inline-flex items-center gap-2 text-sm ${
                soldOut ? 'text-clay' : product.availability === 'LOW_STOCK' ? 'text-clay' : 'text-muted'
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
                className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-muted"
              />
            )}

            <div className="mt-8 flex items-center gap-3">
              <div className="inline-flex h-12 items-center rounded-md border border-line bg-white">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="flex h-full w-11 items-center justify-center text-muted transition hover:text-ink disabled:text-muted/40"
                  disabled={qty <= 1}
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="w-8 text-center text-sm font-semibold text-ink" aria-live="polite">
                  {qty}
                </span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
                  className="flex h-full w-11 items-center justify-center text-muted transition hover:text-ink disabled:text-muted/40"
                  disabled={qty >= MAX_QTY}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                onClick={onAddClick}
                disabled={soldOut || busy}
                className={`${btnPrimary} h-12 flex-1`}
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

            {notice.text && (
              <p
                className={`mt-4 rounded-md px-3.5 py-2.5 text-sm ${
                  notice.type === 'ok' ? 'bg-success-soft text-success' : 'bg-clay/5 text-clay'
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

            <ul className="mt-7 space-y-2.5 border-t border-line pt-6">
              {ASSURANCES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2.5 text-[13.5px] text-muted">
                  <Icon className="h-4 w-4 text-ink/70" aria-hidden="true" />
                  {text}
                </li>
              ))}
            </ul>

            {(details.length > 0 || product.sku) && (
              <dl className="mt-6 divide-y divide-line rounded-lg border border-line bg-white px-5 text-sm">
                {details.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-6 py-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right text-ink">{String(v)}</dd>
                  </div>
                ))}
                {product.sku && (
                  <div className="flex justify-between gap-6 py-3">
                    <dt className="text-muted">SKU</dt>
                    <dd className="text-ink">{product.sku}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
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

  if (data.id !== id) {
    return (
      <div className={`${wrap} grid gap-10 py-16 lg:grid-cols-2`}>
        <div className="aspect-[4/5] animate-pulse rounded-lg bg-sand" />
        <div className="space-y-4 pt-2">
          <div className="h-3.5 w-24 animate-pulse rounded bg-sand" />
          <div className="h-10 w-3/4 animate-pulse rounded bg-sand" />
          <div className="h-6 w-32 animate-pulse rounded bg-sand" />
          <div className="h-12 w-full animate-pulse rounded bg-sand" />
        </div>
      </div>
    )
  }

  if (!data.product) {
    return (
      <EmptyState
        icon={Package}
        title={data.error}
        message="It may have been removed, or the link is wrong."
        className="py-24"
        action={
          <Link to="/shop" className={`${btnPrimary}`}>
            Back to the shop
          </Link>
        }
      />
    )
  }

  return (
    <Reveal>
      <ProductView key={data.product._id} product={data.product} brand={data.brand} />
    </Reveal>
  )
}
