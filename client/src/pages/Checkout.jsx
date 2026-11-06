import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Banknote, Check, MapPin, ShoppingBag } from 'lucide-react'
import api, { getErrorMessage, getFieldErrors } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { useCart } from '../hooks/useCart'
import { useCity } from '../hooks/useCity'
import { useNearby } from '../hooks/useNearby'
import { Skeleton } from '../components/ui'
import Field from '../components/Field'
import { btnPrimary, formatPrice, inputClass, wrap } from '../ui'

// Leaflet is only downloaded when the shopper needs to pin a new address.
const AreaMap = lazy(() => import('../components/nearby/AreaMap'))

const labelClass = 'mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted'

// Delivery notes are required and word-counted — the server enforces the
// same limit, so the two numbers must stay in sync.
const MAX_NOTE_WORDS = 200
const countWords = (value) => {
  const trimmed = value.trim()
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
}

export default function Checkout() {
  const { user } = useAuth()
  const { setCount } = useCart()
  const { city } = useCity()
  const { blocks, blocksReady, coords: areaCoords } = useNearby()
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

  // Saved addresses. `selectedId`: null = the default one, '' = a new address, else a saved id.
  const [addresses, setAddresses] = useState(null) // null while loading
  const [selectedId, setSelectedId] = useState(null)
  // The delivery pin for a NEW address, and which blocks hold it (answered by the server).
  const [pin, setPin] = useState(areaCoords)
  const [pinInfo, setPinInfo] = useState({ key: '', blocks: [], error: '' })
  const [saveIt, setSaveIt] = useState(true)
  const [label, setLabel] = useState('Home')

  useEffect(() => {
    let active = true
    api
      .get('/addresses')
      .then((res) => {
        if (!active) return
        setAddresses(res.data.addresses)
        const first = res.data.addresses.find((a) => a.isDefault) || res.data.addresses[0]
        // The saved address brings its standing delivery notes along.
        if (first?.additionalInstructions) {
          setForm((f) => ({ ...f, additionalInstructions: f.additionalInstructions || first.additionalInstructions }))
        }
      })
      .catch(() => active && setAddresses([]))
    return () => {
      active = false
    }
  }, [])

  const savedList = addresses || []
  const chosen = selectedId === '' ? null : savedList.find((a) => a._id === selectedId) || (selectedId === null ? savedList.find((a) => a.isDefault) || savedList[0] || null : null)
  const useSaved = Boolean(chosen)
  const deliveryPin = useSaved ? { lat: chosen.latitude, lng: chosen.longitude } : pin

  const pinKey = !useSaved && pin ? `${pin.lat},${pin.lng}` : ''
  useEffect(() => {
    if (!pinKey) return undefined
    let active = true
    const [lat, lng] = pinKey.split(',').map(Number)
    api
      .get('/blocks/at', { params: { lat, lng } })
      .then((res) => active && setPinInfo({ key: pinKey, blocks: res.data.containing, error: '' }))
      .catch((err) => active && setPinInfo({ key: pinKey, blocks: [], error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [pinKey])
  const pinChecked = pinInfo.key === pinKey
  const pinOutside = !useSaved && Boolean(pinKey) && pinChecked && pinInfo.blocks.length === 0

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
  const noteWords = countWords(form.additionalInstructions)
  const notesMissing = noteWords < 1
  const notesTooLong = noteWords > MAX_NOTE_WORDS
  const notesInvalid = notesMissing || notesTooLong
  const needsPin = !useSaved && (!pin || pinOutside)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    if (!deliveryPin) {
      setError('Tap the map to mark where we should deliver.')
      return
    }
    setPlacing(true)
    try {
      const notes = form.additionalInstructions.trim() && { additionalInstructions: form.additionalInstructions }
      const shippingAddress = useSaved
        ? {
            fullName: chosen.fullName,
            phone: chosen.phone,
            addressLine: chosen.addressLine,
            city: chosen.city,
            ...(chosen.postalCode && { postalCode: chosen.postalCode }),
            ...notes,
          }
        : {
            fullName: form.fullName,
            phone: form.phone,
            addressLine: form.addressLine,
            city: cityValue,
            ...(form.postalCode.trim() && { postalCode: form.postalCode }),
            ...notes,
          }
      const res = await api.post('/orders', {
        paymentMethod: 'COD',
        shippingAddress,
        deliveryLocation: { latitude: deliveryPin.lat, longitude: deliveryPin.lng },
        ...(useSaved ? { addressId: chosen._id } : saveIt && { saveAddress: { label: label.trim() || 'Home' } }),
      })
      setCount(0)
      navigate('/order-placed', { replace: true, state: { orders: res.data.orders } })
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setPlacing(false)
      const data = err.response?.data
      const notDeliverable = (data?.issues || []).filter((i) => i.code === 'NOT_DELIVERABLE')
      if (notDeliverable.length > 0) {
        const stores = [...new Set(notDeliverable.map((i) => i.brandName).filter(Boolean))]
        setError(`${stores.length ? stores.join(' and ') : 'Some stores'} cannot deliver to this spot. Choose another delivery spot, or remove those items from your cart.`)
      } else if (data?.code === 'CHECKOUT_ISSUES') {
        setError('Some items in your cart changed while you were checking out. Please review your cart.')
      } else if (data?.code === 'OUTSIDE_DELIVERY_ZONE') {
        setError('We do not deliver to that spot yet. Tap inside a shaded area on the map.')
      } else {
        setError(getErrorMessage(err))
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  if (cart.loading)
    return (
      <div className={`${wrap} py-10`}>
        <div className="h-64 animate-pulse rounded-lg bg-sand" />
      </div>
    )
  if (cart.error) return <p className={`${wrap} py-10 text-clay`}>{cart.error}</p>
  if (cart.data.groups.length === 0) return <Navigate to="/cart" replace />

  const { groups, subtotal, itemCount } = cart.data
  const hasIssues = groups.some((g) => g.items.some((i) => i.issue))

  return (
    <div className={`${wrap} py-10`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Almost there</p>
      <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Checkout</h1>

      {hasIssues && (
        <p role="alert" className="mt-6 rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">
          Some items in your cart are unavailable.{' '}
          <Link to="/cart" className="font-medium underline underline-offset-4">
            Review your cart
          </Link>
        </p>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]">
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          {error && (
            <p role="alert" className="rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">
              {error}{' '}
              {error.includes('review your cart') && (
                <Link to="/cart" className="font-medium underline underline-offset-4">
                  Go to cart
                </Link>
              )}
            </p>
          )}

          <fieldset className="rounded-lg border border-line bg-white p-6">
            <legend className="font-display px-1.5 text-lg font-semibold tracking-tight text-ink">
              Delivery address
            </legend>
            {savedList.length > 0 && (
              <div className="space-y-2.5 pt-2" role="radiogroup" aria-label="Saved addresses">
                {savedList.map((a) => {
                  const on = chosen?._id === a._id
                  return (
                    <label key={a._id} className={`flex cursor-pointer items-start gap-3 rounded-md border-2 p-4 ${on ? 'border-ink bg-paper' : 'border-line bg-white'}`}>
                      <input
                        type="radio"
                        name="savedAddress"
                        checked={on}
                        onChange={() => {
                          setSelectedId(a._id)
                          if (a.additionalInstructions) setForm((f) => ({ ...f, additionalInstructions: f.additionalInstructions || a.additionalInstructions }))
                        }}
                        className="mt-1"
                      />
                      <span className="min-w-0 text-sm">
                        <span className="font-semibold text-ink">{a.label}</span>
                        {a.isDefault && <span className="ml-2 text-xs text-muted">Default</span>}
                        <span className="block text-ink/80">{a.fullName} · {a.phone}</span>
                        <span className="block text-muted">{a.addressLine}, {a.city}</span>
                        {a.blocks.length > 0 && (
                          <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-clay">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {a.blocks.map((b) => b.name).join(' + ')}
                          </span>
                        )}
                      </span>
                    </label>
                  )
                })}
                <label className={`flex cursor-pointer items-center gap-3 rounded-md border-2 p-4 text-sm font-medium text-ink ${!useSaved ? 'border-ink bg-paper' : 'border-line bg-white'}`}>
                  <input type="radio" name="savedAddress" checked={!useSaved} onChange={() => setSelectedId('')} />
                  Deliver to a new address
                </label>
              </div>
            )}
            <div className="grid gap-5 pt-4 sm:grid-cols-2">
              {!useSaved && (
                <>
                  <Field label="Full name" id="fullName" name="fullName" autoComplete="name" value={form.fullName} onChange={onChange} error={fieldErrors['shippingAddress.fullName']} required />
                  <Field label="Phone" id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+92 300 1234567" value={form.phone} onChange={onChange} error={fieldErrors['shippingAddress.phone']} required />
                  <div className="sm:col-span-2">
                    <Field label="Street address" id="addressLine" name="addressLine" autoComplete="street-address" value={form.addressLine} onChange={onChange} error={fieldErrors['shippingAddress.addressLine']} required />
                  </div>
                  <Field label="City" id="city" name="city" autoComplete="address-level2" value={cityValue} onChange={onChange} error={fieldErrors['shippingAddress.city']} required />
                  <Field label="Postal code" id="postalCode" name="postalCode" autoComplete="postal-code" value={form.postalCode} onChange={onChange} error={fieldErrors['shippingAddress.postalCode']} hint="Optional." />
                  <div className="sm:col-span-2">
                    <p className={labelClass}>Delivery spot on the map <span className="text-clay">*</span></p>
                    <p className="mb-2 text-[12.5px] text-muted">
                      Tap where we should deliver. Shaded areas are where we deliver. Only stores in that area will deliver to you.
                    </p>
                    {!blocksReady || blocks.length === 0 ? (
                      <Skeleton className="h-[260px] w-full rounded-lg" />
                    ) : (
                      <Suspense fallback={<Skeleton className="h-[260px] w-full rounded-lg" />}>
                        <AreaMap
                          zones={blocks}
                          selectedIds={pinChecked ? pinInfo.blocks.map((b) => b._id) : []}
                          pin={pin}
                          height={260}
                          onPick={(lat, lng) => setPin({ lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 })}
                          label="Map for choosing the delivery spot"
                        />
                      </Suspense>
                    )}
                    <p className="mt-2 min-h-5 text-[12.5px]" aria-live="polite">
                      {!pin ? (
                        <span className="text-muted">No spot chosen yet.</span>
                      ) : !pinChecked ? (
                        <span className="text-muted">Checking the spot…</span>
                      ) : pinInfo.error ? (
                        <span className="text-clay">{pinInfo.error}</span>
                      ) : pinOutside ? (
                        <span className="text-clay">We do not deliver there yet. Tap inside a shaded area.</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-ink">
                          <Check className="h-3.5 w-3.5 text-pine" aria-hidden="true" />
                          Delivering to {pinInfo.blocks.map((b) => b.name).join(' + ')}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                    <label className="flex items-center gap-2 text-sm text-ink">
                      <input type="checkbox" checked={saveIt} onChange={(e) => setSaveIt(e.target.checked)} className="accent-[#1e3a2f]" />
                      Save this address for next time
                    </label>
                    {saveIt && (
                      <label className="flex items-center gap-2 text-sm text-muted">
                        <span className="whitespace-nowrap">Name it</span>
                        <span className="block w-44 shrink-0">
                          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} className={`h-9 ${inputClass}`} aria-label="Address name" placeholder="e.g. Home" />
                        </span>
                      </label>
                    )}
                  </div>
                </>
              )}
              <div className="sm:col-span-2">
                <label htmlFor="additionalInstructions" className={labelClass}>
                  Delivery notes <span className="text-clay">*</span>
                </label>
                <textarea
                  id="additionalInstructions"
                  name="additionalInstructions"
                  rows={3}
                  value={form.additionalInstructions}
                  onChange={onChange}
                  placeholder="Landmark, gate number, best time to call. The courier needs this to reach you."
                  className={`${inputClass} py-3 ${fieldErrors['shippingAddress.additionalInstructions'] || (notesInvalid && (notesMissing || notesTooLong)) ? 'border-clay' : ''}`}
                  required
                />
                <div className="mt-1.5 flex items-start justify-between gap-4">
                  {fieldErrors['shippingAddress.additionalInstructions'] ? (
                    <p className="text-xs text-clay">{fieldErrors['shippingAddress.additionalInstructions']}</p>
                  ) : notesMissing ? (
                    <p className="text-xs text-clay">Delivery notes are required to place your order.</p>
                  ) : notesTooLong ? (
                    <p className="text-xs text-clay">That is over the {MAX_NOTE_WORDS}-word limit.</p>
                  ) : (
                    <span />
                  )}
                  <p
                    className={`shrink-0 text-xs tabular-nums ${
                      notesTooLong ? 'font-semibold text-clay' : 'text-muted'
                    }`}
                  >
                    {noteWords} / {MAX_NOTE_WORDS} words
                  </p>
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-line bg-white p-6">
            <legend className="font-display px-1.5 text-lg font-semibold tracking-tight text-ink">Payment</legend>
            <div className="mt-2 flex items-start gap-3.5 rounded-md border-2 border-ink bg-paper p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-cream text-clay">
                <Banknote className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">Cash on delivery</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  Pay in cash when each order arrives. The rider can also show the store's bank, wallet or card machine on request. Nothing is charged online.
                </p>
              </div>
            </div>
          </fieldset>

          <button type="submit" disabled={placing || hasIssues || notesInvalid || needsPin} className={`${btnPrimary} h-12 w-full sm:w-auto sm:min-w-64`}>
            {placing ? 'Placing order…' : `Place order · ${formatPrice(subtotal)}`}
          </button>
        </form>

        <aside className="h-fit rounded-lg border border-line bg-white p-6 lg:sticky lg:top-24">
          <h2 className="font-display text-lg font-semibold text-ink">
            Order summary <span className="text-sm font-normal text-muted">({itemCount} items)</span>
          </h2>
          <div className="mt-5 space-y-5">
            {groups.map((g) => (
              <div key={g.brand._id}>
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
                  <ShoppingBag className="h-3 w-3" aria-hidden="true" />
                  {g.brand.name}
                </p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {g.items.map((i) => (
                    <li key={i.productId} className="flex justify-between gap-3">
                      <span className="text-ink/80">
                        {i.name} <span className="text-muted">× {i.quantity}</span>
                      </span>
                      <span className="text-ink">{formatPrice(i.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-between border-t border-line pt-4 text-base font-semibold text-ink">
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
