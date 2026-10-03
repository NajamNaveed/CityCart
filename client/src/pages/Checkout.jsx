import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import api, { getErrorMessage, getFieldErrors } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { useCart } from '../hooks/useCart'
import { useCity } from '../hooks/useCity'
import Field from '../components/Field'
import { btnPrimary, formatPrice, inputClass, wrap } from '../ui'

const labelClass = 'mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-muted'

export default function Checkout() {
  const { user } = useAuth()
  const { setCount } = useCart()
  const { city } = useCity()
  const navigate = useNavigate()

  const [cart, setCart] = useState({ loading: true, data: null, error: '' })
  const [form, setForm] = useState({
    fullName: user.name,
    phone: '',
    addressLine: '',
    city: undefined, // follows the chosen city until the shopper edits it
    postalCode: '',
    additionalInstructions: '',
  })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [placing, setPlacing] = useState(false)

  useEffect(() => {
    let active = true
    api
      .get('/cart')
      .then((res) => active && setCart({ loading: false, data: res.data.cart, error: '' }))
      .catch((err) => active && setCart({ loading: false, data: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [])

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  const cityValue = form.city ?? city?.name ?? ''

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setPlacing(true)
    try {
      const res = await api.post('/orders', {
        paymentMethod: 'COD',
        shippingAddress: {
          fullName: form.fullName,
          phone: form.phone,
          addressLine: form.addressLine,
          city: cityValue,
          ...(form.postalCode.trim() && { postalCode: form.postalCode }),
          ...(form.additionalInstructions.trim() && { additionalInstructions: form.additionalInstructions }),
        },
      })
      setCount(0)
      navigate('/order-placed', { replace: true, state: { orders: res.data.orders } })
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setPlacing(false)
      if (err.response?.data?.code === 'CHECKOUT_ISSUES') {
        setError('Some items in your cart changed while you were checking out. Please review your cart.')
      } else {
        setError(getErrorMessage(err))
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  if (cart.loading) return <div className={`${wrap} py-10`}><div className="h-64 animate-pulse bg-sand" /></div>
  if (cart.error) return <p className={`${wrap} py-10 text-clay`}>{cart.error}</p>
  if (cart.data.groups.length === 0) return <Navigate to="/cart" replace />

  const { groups, subtotal, itemCount } = cart.data
  const hasIssues = groups.some((g) => g.items.some((i) => i.issue))

  return (
    <div className={`${wrap} py-10`}>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Checkout</h1>

      {hasIssues && (
        <p role="alert" className="mt-6 border-l-2 border-clay bg-sand px-3 py-2 text-sm">
          Some items in your cart are unavailable.{' '}
          <Link to="/cart" className="font-medium underline underline-offset-4">
            Review your cart
          </Link>
        </p>
      )}

      <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_22rem]">
        <form onSubmit={onSubmit} noValidate className="space-y-10">
          {error && (
            <p role="alert" className="border-l-2 border-clay bg-sand px-3 py-2 text-sm">
              {error}{' '}
              {error.includes('review your cart') && (
                <Link to="/cart" className="font-medium underline underline-offset-4">
                  Go to cart
                </Link>
              )}
            </p>
          )}

          <fieldset className="grid gap-5 sm:grid-cols-2">
            <legend className="mb-5 text-xl font-semibold tracking-tight">Delivery address</legend>
            <Field label="Full name" id="fullName" name="fullName" autoComplete="name" value={form.fullName} onChange={onChange} error={fieldErrors['shippingAddress.fullName']} required />
            <Field label="Phone" id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+92 300 1234567" value={form.phone} onChange={onChange} error={fieldErrors['shippingAddress.phone']} required />
            <div className="sm:col-span-2">
              <Field label="Street address" id="addressLine" name="addressLine" autoComplete="street-address" value={form.addressLine} onChange={onChange} error={fieldErrors['shippingAddress.addressLine']} required />
            </div>
            <Field label="City" id="city" name="city" autoComplete="address-level2" value={cityValue} onChange={onChange} error={fieldErrors['shippingAddress.city']} required />
            <Field label="Postal code" id="postalCode" name="postalCode" autoComplete="postal-code" value={form.postalCode} onChange={onChange} error={fieldErrors['shippingAddress.postalCode']} hint="Optional." />
            <div className="sm:col-span-2">
              <label htmlFor="additionalInstructions" className={labelClass}>
                Delivery notes
              </label>
              <textarea
                id="additionalInstructions"
                name="additionalInstructions"
                rows={3}
                value={form.additionalInstructions}
                onChange={onChange}
                placeholder="Landmark, gate number, best time to call. Optional."
                className={`${inputClass} py-3`}
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-4 text-xl font-semibold tracking-tight">Payment</legend>
            <div className="border border-ink bg-paper p-5">
              <p className="text-sm font-medium">Cash on delivery</p>
              <p className="mt-1 text-sm text-muted">Pay in cash when each order arrives. Nothing is charged online.</p>
            </div>
          </fieldset>

          <button type="submit" disabled={placing || hasIssues} className={`${btnPrimary} w-full sm:w-auto sm:min-w-64`}>
            {placing ? 'Placing order…' : `Place order · ${formatPrice(subtotal)}`}
          </button>
        </form>

        <aside className="h-fit border border-line bg-paper p-6">
          <h2 className="text-lg font-semibold">
            Order summary <span className="text-sm font-normal text-muted">({itemCount} items)</span>
          </h2>
          <div className="mt-5 space-y-5">
            {groups.map((g) => (
              <div key={g.brand._id}>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">{g.brand.name}</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {g.items.map((i) => (
                    <li key={i.productId} className="flex justify-between gap-3">
                      <span>
                        {i.name} <span className="text-muted">× {i.quantity}</span>
                      </span>
                      <span>{formatPrice(i.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-between border-t border-line pt-4 text-base font-semibold">
            <span>Total</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {groups.length > 1 && (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Your cart has {groups.length} brands, so you will get {groups.length} separate orders.
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}