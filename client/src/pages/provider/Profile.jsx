import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import Field from '../../components/Field'
import { Notice, PageHeader } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import { btnPine, inputClass } from '../../ui'

const labelClass = 'mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-ink/55'
const toRupees = (paisa) => (Number.isFinite(paisa) ? String(paisa / 100) : '')

function toPaisa(text) {
  const trimmed = String(text).trim()
  if (!trimmed) return null
  const rupees = Number(trimmed)
  if (!Number.isFinite(rupees) || rupees < 0) return null
  return Math.round(rupees * 100)
}

export default function ProviderProfile() {
  const [state, setState] = useState({ loaded: false, provider: null, error: '' })
  const [form, setForm] = useState({ displayName: '', phone: '', bio: '', addressLine: '', startingAtPrice: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState({ text: '', tone: 'ok' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    api
      .get('/services/provider/me')
      .then((res) => {
        if (!active) return
        const provider = res.data.provider
        setState({ loaded: true, provider, error: '' })
        setForm({
          displayName: provider.displayName || '',
          phone: provider.phone || '',
          bio: provider.bio || '',
          addressLine: provider.addressLine || '',
          startingAtPrice: toRupees(provider.startingAtPrice),
        })
      })
      .catch((err) => active && setState({ loaded: true, provider: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [])

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setFieldErrors({})
    setMessage({ text: '', tone: 'ok' })

    const errors = {}
    if (form.displayName.trim().length < 2) errors.displayName = 'Use at least 2 characters'
    const price = toPaisa(form.startingAtPrice)
    if (price === null) errors.startingAtPrice = 'Enter your starting price in rupees'
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setSaving(true)
    try {
      const res = await api.patch('/services/provider/me', {
        displayName: form.displayName.trim(),
        phone: form.phone.trim() || null,
        bio: form.bio.trim() || null,
        addressLine: form.addressLine.trim(),
        startingAtPrice: price,
      })
      setState((s) => ({ ...s, provider: res.data.provider }))
      setMessage({ text: 'Service profile updated.', tone: 'ok' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setSaving(false)
    }
  }

  if (!state.loaded) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-96 w-full rounded-card" />
      </div>
    )
  }

  if (!state.provider) {
    return (
      <>
        <PageHeader title="Service profile" />
        <p role="alert" className="rounded-tile border border-clay/20 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">{state.error}</p>
      </>
    )
  }

  const provider = state.provider

  return (
    <>
      <PageHeader
        title="Service profile"
        intro="Edit how customers see your service. Changes apply when you save, and do not affect your review status."
      />
      <Notice tone={message.tone}>{message.text}</Notice>

      <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
        <form onSubmit={onSubmit} className="space-y-5 rounded-card border border-line-warm bg-paper-warm p-6" noValidate>
          <Field
            label="Service name"
            id="displayName"
            name="displayName"
            value={form.displayName}
            onChange={onChange}
            error={fieldErrors.displayName}
            required
          />
          <Field
            label="Contact phone"
            id="phone"
            name="phone"
            type="tel"
            placeholder="+92 300 1234567"
            value={form.phone}
            onChange={onChange}
            error={fieldErrors.phone}
            hint="Shared with customers who book you."
          />
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
            error={fieldErrors.startingAtPrice}
            hint="The floor shown on your page. The final price is agreed per job."
            required
          />
          <div>
            <label htmlFor="bio" className={labelClass}>
              What you offer
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={5}
              value={form.bio}
              onChange={onChange}
              placeholder="Describe your service, experience and what a customer should expect."
              className={`${inputClass} py-3 ${fieldErrors.bio ? 'border-clay' : ''}`}
            />
            {fieldErrors.bio && <p className="mt-1.5 text-xs text-clay">{fieldErrors.bio}</p>}
          </div>
          <div>
            <label htmlFor="addressLine" className={labelClass}>
              Address or landmark
            </label>
            <textarea
              id="addressLine"
              name="addressLine"
              rows={2}
              value={form.addressLine}
              onChange={onChange}
              placeholder="Street, landmark — shared only with customers who book you"
              className={`${inputClass} py-3 ${fieldErrors.addressLine ? 'border-clay' : ''}`}
            />
            {fieldErrors.addressLine && <p className="mt-1.5 text-xs text-clay">{fieldErrors.addressLine}</p>}
          </div>
          <button type="submit" disabled={saving} className={btnPine}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>

        <aside className="space-y-4 text-sm">
          <section className="rounded-card border border-line-warm bg-paper-warm p-5">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">Fixed details</h2>
            <dl className="mt-3 space-y-3">
              <div>
                <dt className="text-ink/55">Category</dt>
                <dd className="font-medium text-ink">{provider.category?.name || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink/55">Public link</dt>
                <dd className="font-medium text-ink">
                  <Link to={`/services/${provider.slug}`} className="text-forest hover:underline">
                    /services/{provider.slug}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-ink/55">City</dt>
                <dd className="font-medium text-ink">{provider.city?.name || '—'}</dd>
              </div>
            </dl>
            <p className="mt-4 text-[12.5px] leading-relaxed text-ink/55">
              The category and public link stay fixed. The city is set at signup. Ask CityCart support if either must
              change.
            </p>
          </section>
          <section className="rounded-card border border-line-warm bg-paper-warm p-5">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">Service area</h2>
            <p className="mt-3 font-medium text-ink">
              {[provider.block?.name, provider.city?.name].filter(Boolean).join(', ') || 'Not set'}
            </p>
            <Link to="/provider/area" className="mt-3 inline-block text-[13px] font-medium text-forest hover:underline">
              Change your area
            </Link>
          </section>
        </aside>
      </div>
    </>
  )
}
