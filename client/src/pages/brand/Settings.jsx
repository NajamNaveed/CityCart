import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { ACCEPTED_TYPES, checkImageFile, uploadProductImage } from '../../services/uploads'
import Field from '../../components/Field'
import { Notice, PageHeader } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import { btnPine, inputClass } from '../../ui'

const TABS = ['Profile', 'Contact', 'Fulfillment']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const EMPTY = {
  name: '',
  slug: '',
  description: '',
  logo: '',
  coverImage: '',
  contact: {
    address: { street: '', area: '', city: '' },
    supportPhone: '',
    supportEmail: '',
    operatingHours: { opensAt: '', closesAt: '', closedDays: [] },
  },
  settings: { deliveryFee: '', estimatedDeliveryTime: '', minimumOrderValue: '', deliveryNote: '' },
}

function ImageSetting({ label, name, value, onChange }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function upload(file) {
    if (!file) return
    const problem = checkImageFile(file)
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    setUploading(true)
    try {
      onChange(await uploadProductImage(file))
    } catch (err) {
      setError(err.message || getErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <label htmlFor={`${name}-url`} className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        {value && <img src={value} alt={`${label} preview`} className="h-14 w-14 rounded-md border border-line object-cover" />}
        <input
          id={`${name}-url`}
          type="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Paste an image URL"
          className={`h-11 min-w-0 flex-1 basis-56 ${inputClass}`}
        />
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="sr-only"
          aria-label={`Upload ${label.toLowerCase()}`}
          onChange={(event) => {
            upload(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-[12px] font-medium text-ink hover:border-ink disabled:opacity-50">
          <Upload className="h-4 w-4" aria-hidden="true" />
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {error && <p role="status" className="mt-1.5 text-xs text-clay">{error}</p>}
    </div>
  )
}

function Tabs({ active, onChange }) {
  return (
    <div role="tablist" aria-label="Brand settings" className="mb-6 flex gap-1 border-b border-line">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={active === tab}
          onClick={() => onChange(tab)}
          className={`border-b-2 px-4 py-3 text-[13px] font-medium transition-colors ${active === tab ? 'border-pine text-pine' : 'border-transparent text-muted hover:text-ink'}`}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

export default function BrandSettings() {
  const [brand, setBrand] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [tab, setTab] = useState(TABS[0])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })

  useEffect(() => {
    let active = true
    api
      .get('/brands/me')
      .then(({ data }) => {
        if (!active) return
        const saved = data.brand
        setBrand(saved)
        setForm({
          ...EMPTY,
          ...saved,
          contact: {
            ...EMPTY.contact,
            ...saved.contact,
            address: { ...EMPTY.contact.address, ...saved.contact?.address },
            operatingHours: { ...EMPTY.contact.operatingHours, ...saved.contact?.operatingHours },
          },
          settings: { ...EMPTY.settings, ...saved.settings },
        })
      })
      .catch((err) => active && setMessage({ text: getErrorMessage(err), tone: 'warn' }))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  function updateContact(key, value) {
    setForm((current) => ({ ...current, contact: { ...current.contact, [key]: value } }))
  }

  function updateAddress(key, value) {
    setForm((current) => ({
      ...current,
      contact: { ...current.contact, address: { ...current.contact.address, [key]: value } },
    }))
  }

  function updateHours(key, value) {
    setForm((current) => ({
      ...current,
      contact: { ...current.contact, operatingHours: { ...current.contact.operatingHours, [key]: value } },
    }))
  }

  function updateFulfillment(key, value) {
    setForm((current) => ({ ...current, settings: { ...current.settings, [key]: value } }))
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setMessage({ text: '', tone: 'ok' })
    let changes
    if (tab === 'Profile') {
      changes = { name: form.name, slug: form.slug, description: form.description, logo: form.logo, coverImage: form.coverImage }
    } else if (tab === 'Contact') {
      changes = { contact: form.contact }
    } else {
      changes = {
        settings: {
          ...form.settings,
          deliveryFee: form.settings.deliveryFee === '' ? null : Number(form.settings.deliveryFee),
          minimumOrderValue: form.settings.minimumOrderValue === '' ? null : Number(form.settings.minimumOrderValue),
        },
      }
    }

    try {
      const { data } = await api.patch(`/brands/${brand._id}`, changes)
      setBrand(data.brand)
      setMessage({ text: 'Settings saved.', tone: 'ok' })
    } catch (err) {
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-72 w-full rounded-lg" /></div>

  return (
    <>
      <PageHeader title="Store settings" intro="Brand identity, customer contact details, and fulfillment defaults." />
      <Notice tone={message.tone}>{message.text}</Notice>
      {brand && (
        <>
          <Tabs active={tab} onChange={setTab} />
          <form onSubmit={save} className="space-y-7 rounded-lg border border-line bg-white p-5 sm:p-7">
            {tab === 'Profile' && (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Display name" id="brand-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
                  <Field label="Storefront address" id="brand-slug" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase().replace(/\s+/g, '-') })} required />
                </div>
                <div>
                  <label htmlFor="brand-description" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">Description / story</label>
                  <textarea id="brand-description" rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${inputClass} py-3`} />
                </div>
                <ImageSetting label="Logo" name="brand-logo" value={form.logo} onChange={(logo) => setForm((current) => ({ ...current, logo }))} />
                <ImageSetting label="Storefront cover" name="brand-cover" value={form.coverImage} onChange={(coverImage) => setForm((current) => ({ ...current, coverImage }))} />
              </>
            )}

            {tab === 'Contact' && (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Street address" id="contact-street" value={form.contact.address.street} onChange={(event) => updateAddress('street', event.target.value)} />
                  <Field label="Area" id="contact-area" value={form.contact.address.area} onChange={(event) => updateAddress('area', event.target.value)} />
                  <Field label="City" id="contact-city" value={form.contact.address.city} onChange={(event) => updateAddress('city', event.target.value)} />
                  <Field label="Support phone" id="contact-phone" type="tel" value={form.contact.supportPhone} onChange={(event) => updateContact('supportPhone', event.target.value)} />
                  <Field label="Support email" id="contact-email" type="email" value={form.contact.supportEmail} onChange={(event) => updateContact('supportEmail', event.target.value)} />
                  <Field label="Opening time" id="contact-opens" type="time" value={form.contact.operatingHours.opensAt} onChange={(event) => updateHours('opensAt', event.target.value)} />
                  <Field label="Closing time" id="contact-closes" type="time" value={form.contact.operatingHours.closesAt} onChange={(event) => updateHours('closesAt', event.target.value)} />
                </div>
                <fieldset>
                  <legend className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">Closed days</legend>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {DAYS.map((day) => (
                      <label key={day} className="flex items-center gap-2 text-[13px] text-ink">
                        <input type="checkbox" checked={form.contact.operatingHours.closedDays.includes(day)} onChange={(event) => {
                          const days = form.contact.operatingHours.closedDays
                          updateHours('closedDays', event.target.checked ? [...days, day] : days.filter((item) => item !== day))
                        }} className="h-4 w-4 accent-pine" />
                        {day}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )}

            {tab === 'Fulfillment' && (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Default delivery fee (PKR)" id="delivery-fee" type="number" min="0" step="0.01" value={form.settings.deliveryFee ?? ''} onChange={(event) => updateFulfillment('deliveryFee', event.target.value)} />
                  <Field label="Estimated delivery timeframe" id="delivery-time" placeholder="24–48 hours" value={form.settings.estimatedDeliveryTime} onChange={(event) => updateFulfillment('estimatedDeliveryTime', event.target.value)} />
                  <Field label="Minimum order value (PKR)" id="minimum-order" type="number" min="0" step="0.01" value={form.settings.minimumOrderValue ?? ''} onChange={(event) => updateFulfillment('minimumOrderValue', event.target.value)} />
                </div>
                <div>
                  <label htmlFor="delivery-note" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">Customer delivery instructions</label>
                  <textarea id="delivery-note" rows={4} maxLength={500} value={form.settings.deliveryNote} onChange={(event) => updateFulfillment('deliveryNote', event.target.value)} className={`${inputClass} py-3`} />
                </div>
              </>
            )}

            <button type="submit" disabled={saving} className={btnPine}>{saving ? 'Saving…' : 'Save settings'}</button>
          </form>
        </>
      )}
    </>
  )
}