import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import Field from '../components/Field'
import ResendVerification from '../components/ResendVerification'
import { useAuth } from '../hooks/useAuth'
import { useCity } from '../hooks/useCity'
import { useNameAvailability } from '../hooks/useNameAvailability'
import api, { getErrorMessage, getFieldErrors } from '../services/api'
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
    shopName: '',
    blockId: '',
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
    }
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
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
          <p className={sectionLabel}>Almost open</p>
          <h1 className="font-display mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-ink">
            Verify your email to go live.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-muted">
            Your brand, account and first shop are created. Open the link we just emailed and your shop becomes visible
            to nearby shoppers.
          </p>
        </aside>

        <div className="rounded-lg border border-line bg-white p-6 sm:p-8">
          <MailCheck className="h-10 w-10 text-pine" aria-hidden="true" />
          <h2 className="font-display mt-4 text-[28px] font-semibold tracking-tight text-ink">Check your inbox</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            We sent a verification link to <span className="font-medium text-ink">{sentTo}</span>. It works once and
            expires in 24 hours. You can sign in and open your dashboard after verifying.
          </p>
          <div className="mt-6 rounded-lg bg-paper px-4 py-3 text-[13px] leading-relaxed text-muted">
            Your shop stays hidden from shoppers until then. If the email does not arrive within a few minutes, check
            spam or send it again.
          </div>
          <ResendVerification email={sentTo} portal="brand" className="mt-5" />
          <p className="mt-6 text-sm text-muted">
            Already verified?{' '}
            <Link to="/sell/login" className="font-medium text-pine underline-offset-4 hover:underline">
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
        <p className={sectionLabel}>Open your brand</p>
        <h1 className="font-display mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-ink">
          Tell us about your brand.
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-muted">
          One form creates your owner account, your brand and your first shop. Confirm your email and the shop goes
          live for nearby shoppers — no separate store setup.
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

        <Section number={3} title="Your first shop">
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
          <div>
            <label htmlFor="blockId" className={labelClass}>
              Area / block
            </label>
            <select
              id="blockId"
              name="blockId"
              value={form.blockId}
              onChange={onChange}
              className={`h-11 ${inputClass} ${fieldErrors['branch.blockId'] ? 'border-clay' : ''}`}
              required
            >
              <option value="">{cityId ? 'Choose your shop’s area' : 'Choose a city first'}</option>
              {blocks.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </select>
            {fieldErrors['branch.blockId'] ? (
              <p className="mt-1.5 text-xs text-clay">{fieldErrors['branch.blockId']}</p>
            ) : blocksError ? (
              <p className="mt-1.5 text-xs text-clay">{blocksError}</p>
            ) : cityId && blocks.length === 0 ? (
              <p className="mt-1.5 text-xs text-muted">No areas are set up in this city yet. Contact CityCart support.</p>
            ) : (
              <p className="mt-1.5 text-xs text-muted">The neighbourhood where shoppers will find your shop.</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="shopAddress" className={labelClass}>
              Street address (optional)
            </label>
            <textarea
              id="shopAddress"
              name="shopAddress"
              rows={2}
              value={form.shopAddress}
              onChange={onChange}
              placeholder="Street, landmark — helps riders find you"
              className={`${inputClass} py-3 ${fieldErrors['branch.address'] ? 'border-clay' : ''}`}
            />
            {fieldErrors['branch.address'] && <p className="mt-1.5 text-xs text-clay">{fieldErrors['branch.address']}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="samePhone" checked={form.samePhone} onChange={onChange} className="size-4 accent-[#1e3a2f]" />
              Use my phone number for the shop
            </label>
          </div>
          {!form.samePhone && (
            <Field label="Shop phone" id="shopPhone" name="shopPhone" type="tel" value={form.shopPhone} onChange={onChange} error={fieldErrors['branch.phone']} />
          )}
        </Section>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button type="submit" disabled={submitting} className={`${btnPine} w-full sm:w-auto sm:min-w-64`}>
            {submitting ? 'Creating your shop…' : 'Open your brand'}
          </button>
          <p className="text-xs text-muted">
            By continuing you agree to sell through CityCart and to deliver the orders you accept.
          </p>
        </div>
      </form>
    </div>
  )
}