import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useCity } from '../hooks/useCity'
import { useNameAvailability } from '../hooks/useNameAvailability'
import api, { getErrorMessage, getFieldErrors } from '../services/api'
import { insidePolygon, parseLatLng } from '../utils/geo'
import { Field, Skeleton, fieldLabel } from '../design'
import { ApplySent, ApplyShell, FormSection, SubmitRow } from '../components/seller/ApplyShell'

// Leaflet is downloaded only when the owner reaches the map in the form.
const AreaMap = lazy(() => import('../components/nearby/AreaMap'))

const POINTS = [
  'One form creates your account, your brand and your first shop',
  'Your shop goes live as soon as you verify your email',
  '1% of completed sales, invoiced monthly',
]

// Turns the live name check into the hint line under a field.
function availabilityHint(status, label) {
  if (status === 'checking') return 'Checking…'
  if (status === 'available') return <span className="text-forest">{label} name is available</span>
  return null
}

export default function Apply() {
  const { applyForBrand } = useAuth()
  const { cities, cityId: chosenCity } = useCity()

  const [form, setForm] = useState({
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    ownerPassword: '',
    brandName: '',
    cityId: '',
    description: '',
    shopName: '',
    blockId: '',
    coords: '',
    shopAddress: '',
    samePhone: true,
    shopPhone: '',
  })
  const [blocks, setBlocks] = useState([])
  const [blocksError, setBlocksError] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const onChange = (e) => {
    const { name, type, checked, value } = e.target
    if (name === 'cityId') {
      setBlocks([])
      setBlocksError('')
      // The old shop's block and pin belong to another city.
      setForm((f) => ({ ...f, cityId: value, blockId: '', coords: '' }))
      return
    }
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  // A new block invalidates the pin (it may now be outside the area).
  const onBlockChange = (e) => {
    const blockId = e.target.value
    setForm((f) => ({ ...f, blockId, coords: '' }))
  }

  // The city defaults to the one the visitor was already shopping in.
  const cityId = form.cityId || chosenCity

  // A shop lives in a block of the brand's city; the list follows the city.
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
        setForm((f) => (f.blockId && !list.some((b) => b._id === f.blockId) ? { ...f, blockId: '' } : f))
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

  const brandStatus = useNameAvailability('/brands/check-name', form.brandName)

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
      setFieldErrors({ 'brand.cityId': 'Choose your city' })
      return
    }
    if (!form.blockId) {
      setFieldErrors({ 'branch.blockId': 'Choose the area your shop is in' })
      return
    }
    if (form.coords.trim() && !pin) {
      setFieldErrors({ 'branch.latitude': 'Tap the map to place your shop again.' })
      return
    }
    if (outside) {
      setFieldErrors({ 'branch.latitude': `Place the pin inside ${selectedBlock.name}.` })
      return
    }
    if (brandStatus === 'taken') {
      setError('Please choose a brand name that is not already taken.')
      return
    }

    const shopPhone = form.samePhone ? form.ownerPhone : form.shopPhone
    setSubmitting(true)
    try {
      await applyForBrand({
        owner: {
          name: form.ownerName,
          email: form.ownerEmail,
          password: form.ownerPassword,
          phone: form.ownerPhone,
        },
        brand: { name: form.brandName, cityId, description: form.description },
        branch: {
          name: form.shopName,
          blockId: form.blockId,
          ...(form.shopAddress.trim() && { address: form.shopAddress.trim() }),
          ...(shopPhone.trim() && { phone: shopPhone.trim() }),
          ...(pin && { latitude: pin.lat, longitude: pin.lng }),
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
        kicker="Almost open"
        title="Verify your email to go live."
        intro="Your brand, account and first shop are created. Open the link we just emailed and your shop becomes visible to nearby shoppers."
        email={sentTo}
        note="Your shop stays hidden from shoppers until then. If the email does not arrive within a few minutes, check spam or send it again."
        portal="brand"
        login={{ to: '/sell/login', label: 'Log in to your dashboard' }}
      />
    )
  }

  return (
    <ApplyShell
      kicker="Open your brand"
      title="Tell us about your brand."
      intro="One form creates your owner account, your brand and your first shop. Confirm your email and the shop goes live for nearby shoppers — no separate store setup."
      points={POINTS}
      login={{ lead: 'Already have a brand?', to: '/sell/login', label: 'Log in' }}
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && (
          <p role="alert" className="rounded-tile border border-clay/30 bg-clay/5 px-4 py-3 text-[13px] text-clay">
            {error}
          </p>
        )}

        <FormSection number={1} title="About you" hint="The owner account and how we reach you.">
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
        </FormSection>

        <FormSection number={2} title="Your brand" hint="What shoppers see on your brand page.">
          <Field
            label="Brand name"
            id="brandName"
            name="brandName"
            value={form.brandName}
            onChange={onChange}
            error={fieldErrors['brand.name'] || (brandStatus === 'taken' ? 'That brand name is already taken' : '')}
            hint={availabilityHint(brandStatus, 'Brand')}
            required
          />
          <Field
            as="select"
            label="City"
            id="cityId"
            name="cityId"
            value={cityId}
            onChange={onChange}
            error={fieldErrors['brand.cityId']}
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
            as="textarea"
            label="What do you sell?"
            id="description"
            name="description"
            rows={4}
            className="sm:col-span-2"
            value={form.description}
            onChange={onChange}
            placeholder="A few sentences customers will see on your brand page."
            error={fieldErrors['brand.description']}
            hint="At least 10 characters."
            required
          />
        </FormSection>

        <FormSection
          number={3}
          title="Your first shop"
          hint="The shop that receives orders, inside one block of your city."
        >
          <Field
            label="Shop name"
            id="shopName"
            name="shopName"
            value={form.shopName}
            onChange={onChange}
            error={fieldErrors['branch.name']}
            placeholder="e.g. Main Bazaar shop"
            required
          />
          <Field
            as="select"
            label="Area / block"
            id="blockId"
            name="blockId"
            value={form.blockId}
            onChange={onBlockChange}
            error={fieldErrors['branch.blockId'] || blocksError}
            hint={
              cityId && blocks.length === 0 && !blocksError
                ? 'No areas are set up in this city yet. Contact CityCart support.'
                : 'The neighbourhood where shoppers will find your shop.'
            }
            required
          >
            <option value="">{cityId ? 'Choose your shop’s area' : 'Choose a city first'}</option>
            {blocks.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </Field>

          <div className="sm:col-span-2">
            <p className={fieldLabel}>Shop location on the map</p>
            {form.blockId ? (
              <>
                <p className="mb-2 text-[12px] leading-relaxed text-ink/55">
                  {selectedBlock?.name} is highlighted. Tap inside it to place your shop’s pin — the pin decides the
                  distances shoppers see.
                </p>
                <Suspense fallback={<Skeleton className="h-[300px] w-full" />}>
                  <AreaMap
                    key={form.blockId}
                    zones={zones}
                    selectedIds={selectedIds}
                    pin={pin}
                    height={300}
                    onPick={(lat, lng) => setForm((f) => ({ ...f, coords: `${lat.toFixed(5)}, ${lng.toFixed(5)}` }))}
                    label={`Map for placing the ${selectedBlock?.name || ''} shop`}
                  />
                </Suspense>
                {outside ? (
                  <p className="mt-2 text-[11.5px] text-clay" aria-live="polite">
                    This pin is outside {selectedBlock.name}. Tap inside the highlighted outline.
                  </p>
                ) : fieldErrors['branch.latitude'] ? (
                  <p className="mt-2 text-[11.5px] text-clay">{fieldErrors['branch.latitude']}</p>
                ) : pin ? null : (
                  <p className="mt-2 text-[11.5px] text-muted">Optional — skip this and the middle of the area is used.</p>
                )}
                {/* A pin the owner cannot place — including one outside the area — can always be cleared. */}
                {pin && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, coords: '' }))}
                    className="mt-2 text-[11.5px] font-medium text-clay underline-offset-4 hover:underline"
                  >
                    Use the middle of {selectedBlock.name}
                  </button>
                )}
              </>
            ) : (
              <p className="rounded-tile border border-dashed border-line-warm bg-canvas px-4 py-3 text-[12.5px] text-ink/50">
                Choose an area to pin your shop on the map.
              </p>
            )}
          </div>

          <Field
            as="textarea"
            label="Street address (optional)"
            id="shopAddress"
            name="shopAddress"
            rows={2}
            className="sm:col-span-2"
            value={form.shopAddress}
            onChange={onChange}
            placeholder="Street, landmark — helps riders find you"
            error={fieldErrors['branch.address']}
          />

          <label className="flex items-center gap-3 text-[13px] text-ink/70 sm:col-span-2">
            <input
              type="checkbox"
              name="samePhone"
              checked={form.samePhone}
              onChange={onChange}
              className="size-4 rounded border-line-warm accent-[#1c3a2e]"
            />
            Use my phone number for the shop
          </label>
          {!form.samePhone && (
            <Field label="Shop phone" id="shopPhone" name="shopPhone" type="tel" value={form.shopPhone} onChange={onChange} error={fieldErrors['branch.phone']} />
          )}
        </FormSection>

        <SubmitRow
          submitting={submitting}
          note="By continuing you agree to sell through CityCart and to deliver the orders you accept."
        >
          {submitting ? 'Creating your shop…' : 'Open your brand'}
        </SubmitRow>
      </form>
    </ApplyShell>
  )
}
