import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useCity } from '../hooks/useCity'
import api, { getErrorMessage, getFieldErrors } from '../services/api'
import { insidePolygon, parseLatLng } from '../utils/geo'
import { Field, Skeleton, fieldLabel } from '../design'
import { ApplySent, ApplyShell, FormSection, SubmitRow } from '../components/seller/ApplyShell'

// Leaflet is downloaded only when the applicant reaches the map.
const AreaMap = lazy(() => import('../components/nearby/AreaMap'))

const POINTS = [
  'Your city is fixed at signup; your block can change once a month',
  'Customers see a starting price, then agree the job with you',
  '1% of completed bookings, invoiced monthly',
]

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
      <ApplySent
        kicker="Application received"
        title="Verify your email, then we review."
        intro="Your provider account and service profile are created. After you prove the inbox, a CityCart admin reviews the application. Only approved providers appear to customers."
        email={sentTo}
        note="Your profile stays hidden until two things happen: your email is verified, and a CityCart admin approves your application. You will be notified either way."
        portal="service"
        login={{ to: '/sell/service/login', label: 'Log in to your dashboard' }}
      />
    )
  }

  return (
    <ApplyShell
      kicker="Offer a service"
      title="Tell us what you do."
      intro="Cleaning, plumbing, electrical work, repairs — list your service with a starting price and the area you work in. Customers book a slot and agree the final price with you directly."
      points={POINTS}
      login={{ lead: 'Already applied?', to: '/sell/service/login', label: 'Provider log in' }}
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && (
          <p role="alert" className="rounded-tile border border-clay/30 bg-clay/5 px-4 py-3 text-[13px] text-clay">
            {error}
          </p>
        )}

        <FormSection number={1} title="About you" hint="The account owner and how we reach you.">
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
          <p className="text-[11.5px] leading-relaxed text-ink/45 sm:col-span-2">
            Already have a CityCart account with this email? That address is already taken for services — use another
            one, or sign in to it first.
          </p>
        </FormSection>

        <FormSection number={2} title="Your service" hint="How customers will find and understand what you do.">
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
            as="select"
            label="Service category"
            id="categoryId"
            name="categoryId"
            value={form.categoryId}
            onChange={onChange}
            error={fieldErrors['provider.categoryId'] || categoriesError}
            hint={categories.length === 0 && !categoriesError ? 'Services are not open yet. Contact CityCart support.' : undefined}
            required
          >
            <option value="">Choose a category</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Field>
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
          <Field
            as="textarea"
            label="What you offer"
            id="bio"
            name="bio"
            rows={4}
            className="sm:col-span-2"
            value={form.bio}
            onChange={onChange}
            placeholder="Describe your service, experience and what a customer should expect."
            error={fieldErrors['provider.bio']}
          />
        </FormSection>

        <FormSection number={3} title="Your service area" hint="Where you work. Customers only see the block until you accept a booking.">
          <Field
            as="select"
            label="City"
            id="cityId"
            name="cityId"
            value={cityId}
            onChange={onChange}
            error={fieldErrors['provider.cityId']}
            hint="Your city cannot change later. Choose carefully."
            required
          >
            <option value="">Choose a city</option>
            {cities.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Field>
          <Field
            as="select"
            label="Area / block"
            id="blockId"
            name="blockId"
            value={form.blockId}
            onChange={onChange}
            error={fieldErrors['provider.blockId'] || blocksError}
            hint={
              cityId && blocks.length === 0 && !blocksError
                ? 'No areas are set up in this city yet. Contact CityCart support.'
                : 'The neighbourhood you will serve. Changeable once a month.'
            }
            required
          >
            <option value="">{cityId ? 'Choose the area you work in' : 'Choose a city first'}</option>
            {blocks.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </Field>

          <div className="sm:col-span-2">
            <p className={fieldLabel}>Your pin on the map</p>
            {form.blockId ? (
              <>
                <p className="mb-2 text-[12px] leading-relaxed text-ink/55">
                  {selectedBlock?.name} is highlighted. Tap inside it to place your pin. Customers only see your block
                  until you accept a booking.
                </p>
                <Suspense fallback={<Skeleton className="h-[300px] w-full" />}>
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
                  <p className="mt-2 text-[11.5px] text-clay" aria-live="polite">
                    This pin is outside {selectedBlock.name}. Tap inside the highlighted outline.
                  </p>
                ) : fieldErrors['provider.latitude'] ? (
                  <p className="mt-2 text-[11.5px] text-clay">{fieldErrors['provider.latitude']}</p>
                ) : pin ? null : (
                  <p className="mt-2 text-[11.5px] text-muted">Your pin is required.</p>
                )}
              </>
            ) : (
              <p className="rounded-tile border border-dashed border-line-warm bg-canvas px-4 py-3 text-[12.5px] text-ink/50">
                Choose an area to place your pin on the map.
              </p>
            )}
          </div>

          <Field
            as="textarea"
            label="Address or landmark (optional)"
            id="addressLine"
            name="addressLine"
            rows={2}
            className="sm:col-span-2"
            value={form.addressLine}
            onChange={onChange}
            placeholder="Street, landmark — shared only with customers who book you"
            error={fieldErrors['provider.addressLine']}
          />
        </FormSection>

        <SubmitRow
          submitting={submitting}
          note="By continuing you agree to CityCart’s provider terms and the 1% fee on completed bookings."
        >
          {submitting ? 'Submitting your application…' : 'Apply as a provider'}
        </SubmitRow>
      </form>
    </ApplyShell>
  )
}
