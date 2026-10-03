import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api, { getErrorMessage } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { useCart } from '../hooks/useCart'
import ProductImage from '../components/ProductImage'
import { loginUrl } from '../utils/nav'
import { btnPrimary, formatPrice, sectionLabel, wrap } from '../ui'

const MAX_QTY = 10

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
  const resumed = useRef(false)

  const isCustomer = user?.role === 'CUSTOMER'
  const soldOut = product.availability === 'OUT_OF_STOCK'
  const images = product.images?.length ? product.images : [null]
  const discount =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round((1 - product.price / product.compareAtPrice) * 100)
      : 0
  const details = Object.entries(product.attributes || {}).filter(([, v]) => v !== '' && v != null)

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

  return (
    <div className={`${wrap} py-10`}>
      <p className="text-[13px] text-muted">
        <Link to="/" className="hover:text-clay">
          Home
        </Link>
        {' / '}
        <Link to="/shop" className="hover:text-clay">
          Shop
        </Link>
      </p>

      <div className="mt-6 grid gap-12 lg:grid-cols-2">
        <div>
          <div className="overflow-hidden bg-sand">
            <ProductImage src={images[shown]} name={product.name} className="aspect-[4/5] w-full" />
          </div>
          {images.length > 1 && (
            <div className="mt-3 grid grid-cols-5 gap-3">
              {images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setShown(i)}
                  aria-label={`Show image ${i + 1}`}
                  className={`overflow-hidden border ${i === shown ? 'border-ink' : 'border-transparent'}`}
                >
                  <ProductImage src={src} name={product.name} className="aspect-square w-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:pt-4">
          {brand && (
            <Link to={`/shop?brandId=${brand._id}`} className={`${sectionLabel} hover:text-clay`}>
              {brand.name}
            </Link>
          )}
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{product.name}</h1>

          <p className="mt-5 flex items-baseline gap-3">
            <span className="text-2xl font-semibold">{formatPrice(product.price)}</span>
            {discount > 0 && (
              <>
                <span className="text-base text-muted line-through">{formatPrice(product.compareAtPrice)}</span>
                <span className="text-sm font-medium text-clay">{discount}% off</span>
              </>
            )}
          </p>

          <p className={`mt-3 text-sm ${product.availability === 'IN_STOCK' ? 'text-muted' : 'text-clay'}`}>
            {soldOut ? 'Sold out' : product.availability === 'LOW_STOCK' ? 'Only a few left' : 'In stock'}
          </p>

          {product.description && (
            <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-muted">{product.description}</p>
          )}

          <div className="mt-8 flex items-center gap-4">
            <div className="inline-flex h-11 items-center border border-line bg-paper">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="h-full w-11 text-lg hover:bg-sand"
              >
                −
              </button>
              <span className="w-10 text-center text-sm font-medium" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
                className="h-full w-11 text-lg hover:bg-sand"
              >
                +
              </button>
            </div>
            <button type="button" onClick={onAddClick} disabled={soldOut || busy} className={`${btnPrimary} flex-1`}>
              {soldOut ? 'Sold out' : busy ? 'Adding…' : 'Add to cart'}
            </button>
          </div>

          {notice.text && (
            <p className={`mt-4 text-sm ${notice.type === 'ok' ? 'text-ink' : 'text-clay'}`} role="status">
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

          <p className="mt-6 border-t border-line pt-5 text-sm text-muted">
            Pay with cash when your order is delivered.
          </p>

          {(details.length > 0 || product.sku) && (
            <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
              {details.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-6 py-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right">{String(v)}</dd>
                </div>
              ))}
              {product.sku && (
                <div className="flex justify-between gap-6 py-3">
                  <dt className="text-muted">SKU</dt>
                  <dd>{product.sku}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </div>
    </div>
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
      <div className={`${wrap} grid gap-12 py-16 lg:grid-cols-2`}>
        <div className="aspect-[4/5] animate-pulse bg-sand" />
        <div className="space-y-4">
          <div className="h-4 w-24 animate-pulse bg-sand" />
          <div className="h-10 w-3/4 animate-pulse bg-sand" />
          <div className="h-6 w-32 animate-pulse bg-sand" />
        </div>
      </div>
    )
  }

  if (!data.product) {
    return (
      <div className={`${wrap} py-24 text-center`}>
        <p className="text-xl font-medium">{data.error}</p>
        <Link to="/shop" className="mt-4 inline-block text-clay underline underline-offset-4">
          Back to the shop
        </Link>
      </div>
    )
  }

  return <ProductView key={data.product._id} product={data.product} brand={data.brand} />
}