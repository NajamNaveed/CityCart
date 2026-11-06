import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import Field from '../components/Field'
import ResendVerification from '../components/ResendVerification'
import { Skeleton } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useCity } from '../hooks/useCity'
import api, { getErrorMessage, getFieldErrors } from '../services/api'
import { insidePolygon, parseLatLng } from '../utils/geo'
import { btnPine, inputClass, sectionLabel, wrap } from '../ui'

// Leaflet is downloaded only when the applicant reaches the map.
const AreaMap = lazy(() => import('../components/nearby/AreaMap'))

const labelClass = 'mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-muted'

function Section({ number, title, children }) {
  return (
    <fieldset className="rounded-lg border border-line bg-white p-6">
      <legend className="sr-only">{title}</legend>
      <div className="flex items-baseline gap-3">
        <span className="font-display text-lg font-semibold text-pine">0{number}</span>
        <h2 className="text-[17px] font-semibold tracking-tight text-ink">{title}</h2>
      </div>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

// Rupees typed by the applicant -> integer paisa the API stores.
function toPaisa(text) {
  const trimmed = String(text).trim()
  if (!trimmed) return null
  const rupees = Number(trimmed)
  if (!Number.isFinite(rupees) || rupees < 0) return null
  return Math.round(rupees * 100)
}

export default function ProviderApply() {
  const { applyForService } = useAuth()
  const { cities, cityId: chosenCity } = useCity()

  const [form, setForm] = useState({
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    ownerPassword: '',
    displayName: '',
    legalName: '',
    categoryId: '',
    cityId: '',
    blockId: '',
    coords: '',
    addressLine: '',
    bio: '',
    startingAtPrice: '',
  })
  const [categories, setCategories] = useState([])
  const [categoriesError, setCategoriesError] = useState('')
  const [blocks, setBlocks] = useState([])
  const [blocksError, setBlocksError] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const onChange = (e) => {
    const { name, value } = e.target
    if (name === 'cityId') {
      // A new city means new blocks and a pin that no longer applies.
      setBlocks([])
      setBlocksError('')
      setForm((f) => ({ ...f, cityId: value, blockId: '', coords: '' }))
      return
    }
    if (name === 'blockId') {
      setForm((f) => ({ ...f, blockId: value, coords: '' }))
      return
    }
    setForm((f) => ({ ...f, [name]: value }))
  }

  useEffect(() => {
    let active = true
    api
      .get('/services/categories')
      .then((res) => {
        if (!active) return
        setCategories(Array.isArray(res.data.categories) ? res.data.categories : [])
        setCategoriesError('')
      })
      .catch((err) => active && setCategoriesError(getErrorMessage(err)))
    return () => {
      active = false
    }
  }, [])

  // The city defaults to the one the visitor was already shopping in.
  const cityId = form.cityId || chosenCity

  // A provider works in one block of its city; the list follows the city.
  useEffect(() => {
    if (!cityId) return undefined
    let active = true
    api
      .get('/blocks', { params: { cityId, isActive: true } })
      .then((res) => {
        if (!active) return
        const list = res.data.blocks || []
        setBlocks(list)
        setBlocksError('')
        setForm((f) => (f.blockId && !list.some((b) => b._id === f.blockId) ? { ...f, blockId: '', coords: '' } : f))
      })
      .catch((err) => {
        if (!active) return
        setBlocks([])
        setBlocksError(getErrorMessage(err))
      })
    return () => {
      active = false
    }
  }, [cityId])

  const selectedBlock = blocks.find((b) => b._id === form.blockId) || null
  const pin = form.coords.trim() ? parseLatLng(form.coords) : null
  const outside = Boolean(pin && selectedBlock?.polygon && !insidePolygon(pin, selectedBlock.polygon))
  const zones = useMemo(() => (selectedBlock ? [selectedBlock] : []), [selectedBlock])
  const selectedIds = useMemo(() => (form.blockId ? [form.blockId] : []), [form.blockId])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    if (!cityId) {
      setFieldErrors({ 'provider.cityId': 'Choose your city' })
      return
    }
    if (!form.blockId) {
      setFieldErrors({ 'provider.blockId': 'Choose the area you will work in' })
      return
    }
    if (!pin) {
      setFieldErrors({ 'provider.latitude': 'Tap the map to place your pin inside the block.' })
      return
    }
    if (outside) {
      setFieldErrors({ 'provider.latitude': `Place the pin inside ${selectedBlock.name}.` })
      return
    }
    const startingAtPrice = toPaisa(form.startingAtPrice)
    if (startingAtPrice === null) {
      setFieldErrors({ 'provider.startingAtPrice': 'Enter your starting price in rupees' })
      return
    }

    setSubmitting(true)
    try {
      await applyForService({
        owner: {
          name: form.ownerName,
          email: form.ownerEmail,
          password: form.ownerPassword,
          phone: form.ownerPhone,
        },
        provider: {
          displayName: form.displayName,
          categoryId: form.categoryId,
          cityId,
          blockId: form.blockId,
          latitude: pin.lat,
          longitude: pin.lng,
          startingAtPrice,
          ...(form.legalName.trim() && { legalName: form.legalName.trim() }),
          ...(form.addressLine.trim() && { addressLine: form.addressLine.trim() }),
          ...(form.bio.trim() && { bio: form.bio.trim() }),
        },
      })
      window.scrollTo({ top: 0 })
      setSentTo(form.ownerEmail.trim())
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSubmitting(false)
    }
  }

  if (sentTo) {
    return (
      <div className={`${wrap} grid gap-14 py-14 lg:grid-cols-[1fr_2fr] lg:py-20`}>
        <aside className="lg:sticky lg:top-28 lg:h-fit">
          <p className={sectionLabel}>Application received</p>
          <h1 className="font-display mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-ink">
            Verify your email, then we review.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-muted">
            Your provider account and service profile are created. After you prove the inbox, a CityCart admin reviews
            the application. Only approved providers appear to customers.
          </p>
        </aside>

        <div className="rounded-lg border border-line bg-white p-6 sm:p-8">
          <MailCheck className="h-10 w-10 text-pine" aria-hidden="true" />
          <h2 className="font-display mt-4 text-[28px] font-semibold tracking-tight text-ink">Check your inbox</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            We sent a verification link to <span className="font-medium text-ink">{sentTo}</span>. It works once and
            expires in 24 hours. Sign in after verifying to see your review status.
          </p>
          <div className="mt-6 rounded-lg bg-paper px-4 py-3 text-[13px] leading-relaxed text-muted">
            Your profile stays hidden until two things happen: your email is verified, and a CityCart admin approves
            your application. You will be notified either way.
          </div>
          <ResendVerification email={sentTo} portal="service" className="mt-5" />
          <p className="mt-6 text-sm text-muted">
            Already verified?{' '}
            <Link to="/sell/service/login" className="font-medium text-pine underline-offset-4 hover:underline">
              Log in to your dashboard
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`${wrap} grid gap-14 py-14 lg:grid-cols-[1fr_2fr] lg:py-20`}>
      <aside className="lg:sticky lg:top-28 lg:h-fit">
        <p className={sectionLabel}>Offer a service</p>
        <h1 className="font-display mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-ink">
          Tell us what you do.
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-muted">
          Cleaning, plumbing, electrical work, repairs — list your service with a starting price and the area you
          work in. Customers book a slot and agree the final price with you directly.
        </p>
        <ul className="mt-8 space-y-2 text-sm text-muted">
          <li>Your city is fixed at signup.</li>
          <li>You may change your block once a month.</li>
          <li>CityCart takes 1% monthly, billed after you start earning.</li>
        </ul>
        <p className="mt-8 text-sm text-muted">
          Already applied?{' '}
          <Link to="/sell/service/login" className="font-medium text-pine underline-offset-4 hover:underline">
            Provider log in
          </Link>
        </p>
      </aside>

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && (
          <p role="alert" className="rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">
            {error}
          </p>
        )}

        <Section number={1} title="About you">
          <Field label="Your name" id="ownerName" name="ownerName" autoComplete="name" value={form.ownerName} onChange={onChange} error={fieldErrors['owner.name']} required />
          <Field label="Phone" id="ownerPhone" name="ownerPhone" type="tel" autoComplete="tel" placeholder="+92 300 1234567" value={form.ownerPhone} onChange={onChange} error={fieldErrors['owner.phone']} required />
          <Field label="Email" id="ownerEmail" name="ownerEmail" type="email" autoComplete="email" value={form.ownerEmail} onChange={onChange} error={fieldErrors['owner.email']} required />
          <Field
            label="Password"
            id="ownerPassword"
            name="ownerPassword"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={form.ownerPassword}
            onChange={onChange}
            error={fieldErrors['owner.password']}
            required
          />
          <p className="text-xs leading-relaxed text-muted sm:col-span-2">
            Already have a CityCart account with this email? That address is already taken for services — use another
            one, or sign in to it first.
          </p>
        </Section>

        <Section number={2} title="Your service">
          <Field
            label="Service name"
            id="displayName"
            name="displayName"
            value={form.displayName}
            onChange={onChange}
            error={fieldErrors['provider.displayName']}
            placeholder="e.g. Ali Home Cleaning"
            required
          />
          <Field
            label="Legal or full name (optional)"
            id="legalName"
            name="legalName"
            value={form.legalName}
            onChange={onChange}
            error={fieldErrors['provider.legalName']}
            placeholder="Shown to CityCart admins only"
          />
          <div>
            <label htmlFor="categoryId" className={labelClass}>
              Service category
            </label>
            <select
              id="categoryId"
              name="categoryId"
              value={form.categoryId}
              onChange={onChange}
              className={`h-11 ${inputClass} ${fieldErrors['provider.categoryId'] ? 'border-clay' : ''}`}
              required
            >
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
            {fieldErrors['provider.categoryId'] ? (
              <p className="mt-1.5 text-xs text-clay">{fieldErrors['provider.categoryId']}</p>
            ) : categoriesError ? (
              <p className="mt-1.5 text-xs text-clay">{categoriesError}</p>
            ) : categories.length === 0 ? (
              <p className="mt-1.5 text-xs text-muted">Services are not open yet. Contact CityCart support.</p>
            ) : null}
          </div>
          <Field
            label="Starting price (Rs)"
            id="startingAtPrice"
            name="startingAtPrice"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={form.startingAtPrice}
            onChange={onChange}
            error={fieldErrors['provider.startingAtPrice']}
            hint="What customers see on your page. The final price is agreed per job."
            placeholder="e.g. 1500"
            required
          />
          <div className="sm:col-span-2">
            <label htmlFor="bio" className={labelClass}>
              What you offer
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={4}
              value={form.bio}
              onChange={onChange}
              placeholder="Describe your service, experience and what a customer should expect."
              className={`${inputClass} py-3 ${fieldErrors['provider.bio'] ? 'border-clay' : ''}`}
            />
            {fieldErrors['provider.bio'] && <p className="mt-1.5 text-xs text-clay">{fieldErrors['provider.bio']}</p>}
          </div>
        </Section>

        <Section number={3} title="Your service area">
          <div>
            <label htmlFor="cityId" className={labelClass}>
              City
            </label>
            <select id="cityId" name="cityId" value={cityId} onChange={onChange} className={`h-11 ${inputClass} ${fieldErrors['provider.cityId'] ? 'border-clay' : ''}`} required>
              <option value="">Choose a city</option>
              {cities.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
            {fieldErrors['provider.cityId'] ? (
              <p className="mt-1.5 text-xs text-clay">{fieldErrors['provider.cityId']}</p>
            ) : (
              <p className="mt-1.5 text-xs text-muted">Your city cannot change later. Choose carefully.</p>
            )}
          </div>
          <div>
            <label htmlFor="blockId" className={labelClass}>
              Area / block
            </label>
            <select
              id="blockId"
              name="blockId"
              value={form.blockId}
              onChange={onChange}
              className={`h-11 ${inputClass} ${fieldErrors['provider.blockId'] ? 'border-clay' : ''}`}
              required
            >
              <option value="">{cityId ? 'Choose the area you work in' : 'Choose a city first'}</option>
              {blocks.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </select>
            {fieldErrors['provider.blockId'] ? (
              <p className="mt-1.5 text-xs text-clay">{fieldErrors['provider.blockId']}</p>
            ) : blocksError ? (
              <p className="mt-1.5 text-xs text-clay">{blocksError}</p>
            ) : cityId && blocks.length === 0 ? (
              <p className="mt-1.5 text-xs text-muted">No areas are set up in this city yet. Contact CityCart support.</p>
            ) : (
              <p className="mt-1.5 text-xs text-muted">The neighbourhood you will serve. Changeable once a month.</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <p className={labelClass}>Your pin on the map</p>
            {form.blockId ? (
              <>
                <p className="mb-2 text-[13px] text-muted">
                  {selectedBlock?.name} is highlighted. Tap inside it to place your pin. Customers only see your block
                  until you accept a booking.
                </p>
                <Suspense fallback={<Skeleton className="h-[300px] w-full rounded-lg" />}>
                  <AreaMap
                    key={form.blockId}
                    zones={zones}
                    selectedIds={selectedIds}
                    pin={pin}
                    height={300}
                    onPick={(lat, lng) => setForm((f) => ({ ...f, coords: `${lat.toFixed(5)}, ${lng.toFixed(5)}` }))}
                    label={`Map for placing the ${selectedBlock?.name || ''} service pin`}
                  />
                </Suspense>
                {outside ? (
                  <p className="mt-2 text-xs text-clay" aria-live="polite">
                    This pin is outside {selectedBlock.name}. Tap inside the highlighted outline.
                  </p>
                ) : fieldErrors['provider.latitude'] ? (
                  <p className="mt-2 text-xs text-clay">{fieldErrors['provider.latitude']}</p>
                ) : pin ? null : (
                  <p className="mt-2 text-xs text-muted">Your pin is required.</p>
                )}
              </>
            ) : (
              <p className="rounded-md bg-paper px-3.5 py-3 text-[13px] text-muted">
                Choose an area to place your pin on the map.
              </p>
            )}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="addressLine" className={labelClass}>
              Address or landmark (optional)
            </label>
            <textarea
              id="addressLine"
              name="addressLine"
              rows={2}
              value={form.addressLine}
              onChange={onChange}
              placeholder="Street, landmark — shared only with customers who book you"
              className={`${inputClass} py-3 ${fieldErrors['provider.addressLine'] ? 'border-clay' : ''}`}
            />
            {fieldErrors['provider.addressLine'] && <p className="mt-1.5 text-xs text-clay">{fieldErrors['provider.addressLine']}</p>}
          </div>
        </Section>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button type="submit" disabled={submitting} className={`${btnPine} w-full sm:w-auto sm:min-w-64`}>
            {submitting ? 'Submitting your application…' : 'Apply as a provider'}
          </button>
          <p className="text-xs text-muted">
            By continuing you agree to CityCart&rsquo;s provider terms and the 1% monthly fee once you start earning.
          </p>
        </div>
      </form>
    </div>
  )
}
