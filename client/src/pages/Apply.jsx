import { useState } from 'react'
import { Link } from 'react-router-dom'
import Field from '../components/Field'
import { useAuth } from '../hooks/useAuth'
import { useCity } from '../hooks/useCity'
import { useNameAvailability } from '../hooks/useNameAvailability'
import { getErrorMessage, getFieldErrors } from '../services/api'
import { btnPine, inputClass, sectionLabel, wrap } from '../ui'

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

// Turns the live name check into the hint line under a field.
function availabilityHint(status, label) {
  if (status === 'checking') return 'Checking…'
  if (status === 'available') return <span className="text-pine">{label} name is available</span>
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
    storeName: '',
    addressLine: '',
    storeCity: undefined, // undefined until edited: then it follows the chosen city
    samePhone: true,
    storePhone: '',
  })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const onChange = (e) => {
    const { name, type, checked, value } = e.target
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  // The city defaults to the one the visitor was already shopping in.
  const cityId = form.cityId || chosenCity
  const selectedCity = cities.find((c) => c._id === cityId)
  const storeCity = form.storeCity ?? selectedCity?.name ?? ''

  const brandStatus = useNameAvailability('/brands/check-name', form.brandName)
  const storeStatus = useNameAvailability('/stores/check-name', form.storeName)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    if (!cityId) {
      setFieldErrors({ 'brand.cityId': 'Choose your city' })
      return
    }
    if (brandStatus === 'taken' || storeStatus === 'taken') {
      setError('Please choose a brand and store name that are not already taken.')
      return
    }

    const storePhone = form.samePhone ? form.ownerPhone : form.storePhone
    setSubmitting(true)
    try {
      // On success AuthProvider holds the new session and GuestRoute moves them to /brand.
      await applyForBrand({
        owner: {
          name: form.ownerName,
          email: form.ownerEmail,
          password: form.ownerPassword,
          phone: form.ownerPhone,
        },
        brand: { name: form.brandName, cityId, description: form.description },
        store: {
          name: form.storeName,
          address: { addressLine: form.addressLine, city: storeCity },
          contact: { phone: storePhone },
        },
      })
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
      setSubmitting(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <div className={`${wrap} grid gap-14 py-14 lg:grid-cols-[1fr_2fr] lg:py-20`}>
      <aside className="lg:sticky lg:top-28 lg:h-fit">
        <p className={sectionLabel}>Open your brand</p>
        <h1 className="font-display mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-ink">
          Tell us about your brand.
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-muted">
          One form creates your owner account, your brand and your first store. You are signed in straight away, and
          the store goes live when you submit.
        </p>
        <p className="mt-8 text-sm text-muted">
          Already have a brand?{' '}
          <Link to="/sell/login" className="font-medium text-pine underline-offset-4 hover:underline">
            Log in
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
        </Section>

        <Section number={2} title="Your brand">
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
          <div>
            <label htmlFor="cityId" className={labelClass}>
              City
            </label>
            <select id="cityId" name="cityId" value={cityId} onChange={onChange} className={`h-11 ${inputClass} ${fieldErrors['brand.cityId'] ? 'border-clay' : ''}`} required>
              <option value="">Choose a city</option>
              {cities.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
            {fieldErrors['brand.cityId'] && <p className="mt-1.5 text-xs text-clay">{fieldErrors['brand.cityId']}</p>}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="description" className={labelClass}>
              What do you sell?
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              value={form.description}
              onChange={onChange}
              placeholder="A few sentences customers will see on your brand page."
              className={`${inputClass} py-3 ${fieldErrors['brand.description'] ? 'border-clay' : ''}`}
              required
            />
            {fieldErrors['brand.description'] ? (
              <p className="mt-1.5 text-xs text-clay">{fieldErrors['brand.description']}</p>
            ) : (
              <p className="mt-1.5 text-xs text-muted">At least 10 characters.</p>
            )}
          </div>
        </Section>

        <Section number={3} title="Your first store">
          <Field
            label="Store name"
            id="storeName"
            name="storeName"
            value={form.storeName}
            onChange={onChange}
            error={fieldErrors['store.name'] || (storeStatus === 'taken' ? 'That store name is already taken' : '')}
            hint={availabilityHint(storeStatus, 'Store')}
            required
          />
          <Field label="Town or city" id="storeCity" name="storeCity" value={storeCity} onChange={onChange} error={fieldErrors['store.address.city']} required />
          <div className="sm:col-span-2">
            <Field label="Street address" id="addressLine" name="addressLine" autoComplete="street-address" value={form.addressLine} onChange={onChange} error={fieldErrors['store.address.addressLine']} required />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="samePhone" checked={form.samePhone} onChange={onChange} className="size-4 accent-[#1e3a2f]" />
              Use my phone number for the store
            </label>
          </div>
          {!form.samePhone && (
            <Field label="Store phone" id="storePhone" name="storePhone" type="tel" value={form.storePhone} onChange={onChange} error={fieldErrors['store.contact.phone']} required />
          )}
        </Section>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button type="submit" disabled={submitting} className={`${btnPine} w-full sm:w-auto sm:min-w-64`}>
            {submitting ? 'Opening your brand…' : 'Open your brand'}
          </button>
          <p className="text-xs text-muted">
            By continuing you agree to sell through CityCart and to deliver the orders you accept.
          </p>
        </div>
      </form>
    </div>
  )
}