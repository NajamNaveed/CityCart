import { useEffect, useState } from 'react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import Field from '../../components/Field'
import { Notice, PageHeader } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import { btnDark, inputClass } from '../../ui'

const TABS = ['Commercial', 'Policies', 'System Controls']
const EMPTY = {
  platformName: 'CityCart',
  supportEmail: '',
  supportPhone: '',
  commissionRate: '',
  codMaxOrderAmount: '',
  brandOnboardingPolicy: 'INSTANT_ACTIVATION',
  orderCancellationGraceMinutes: '',
  announcement: { text: '', enabled: false },
  maintenanceMode: false,
}

function Tabs({ active, onChange }) {
  return (
    <div role="tablist" aria-label="Platform settings" className="mb-6 flex gap-1 border-b border-line">
      {TABS.map((tab) => (
        <button key={tab} type="button" role="tab" aria-selected={active === tab} onClick={() => onChange(tab)} className={`border-b-2 px-4 py-3 text-[13px] font-medium transition-colors ${active === tab ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
          {tab}
        </button>
      ))}
    </div>
  )
}

function Toggle({ id, label, checked, onChange }) {
  return (
    <label htmlFor={id} className="flex min-h-12 items-center justify-between gap-5 border-b border-line py-3 last:border-b-0">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-9 shrink-0 cursor-pointer accent-ink" />
    </label>
  )
}

export default function AdminSettings() {
  const [form, setForm] = useState(EMPTY)
  const [tab, setTab] = useState(TABS[0])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    let active = true
    api
      .get('/admin/settings')
      .then(({ data }) => {
        if (!active) return
        const settings = data.settings
        setForm({
          ...EMPTY,
          ...settings,
          commissionRate: settings.commissionRate ?? '',
          codMaxOrderAmount: settings.codMaxOrderAmount ?? '',
          orderCancellationGraceMinutes: settings.orderCancellationGraceMinutes ?? '',
          announcement: { ...EMPTY.announcement, ...settings.announcement },
        })
      })
      .catch((err) => active && setMessage({ text: getErrorMessage(err), tone: 'warn' }))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  function setValue(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function save(event) {
    event.preventDefault()
    setFieldErrors({})
    setSaving(true)
    setMessage({ text: '', tone: 'ok' })
    let changes
    if (tab === 'Commercial') {
      changes = {
        platformName: form.platformName,
        supportEmail: form.supportEmail,
        supportPhone: form.supportPhone,
        commissionRate: form.commissionRate === '' ? null : Number(form.commissionRate),
      }
    } else if (tab === 'Policies') {
      changes = {
        codMaxOrderAmount: form.codMaxOrderAmount === '' ? null : Number(form.codMaxOrderAmount),
        brandOnboardingPolicy: form.brandOnboardingPolicy,
        orderCancellationGraceMinutes: form.orderCancellationGraceMinutes === '' ? null : Number(form.orderCancellationGraceMinutes),
      }
    } else {
      changes = { announcement: form.announcement, maintenanceMode: form.maintenanceMode }
    }

    try {
      const { data } = await api.patch('/admin/settings', changes)
      setForm((current) => ({ ...current, ...data.settings, announcement: { ...current.announcement, ...data.settings.announcement } }))
      setMessage({ text: 'Platform settings saved.', tone: 'ok' })
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-72 w-full rounded-lg" /></div>

  return (
    <>
      <PageHeader title="Platform settings" intro="Marketplace identity, policies, and system controls." />
      <Notice tone={message.tone}>{message.text}</Notice>
      {Object.keys(fieldErrors).length > 0 && (
        <ul className="mb-5 space-y-1 text-xs text-clay" role="alert">
          {Object.entries(fieldErrors).map(([field, error]) => <li key={field}>{field}: {error}</li>)}
        </ul>
      )}
      <Tabs active={tab} onChange={setTab} />
      <form onSubmit={save} className="space-y-7 rounded-lg border border-line bg-white p-5 sm:p-7">
        {tab === 'Commercial' && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Platform name" id="platform-name" value={form.platformName} onChange={(event) => setValue('platformName', event.target.value)} required />
            <Field label="Primary support email" id="platform-email" type="email" value={form.supportEmail} onChange={(event) => setValue('supportEmail', event.target.value)} />
            <Field label="Support hotline" id="platform-phone" type="tel" value={form.supportPhone} onChange={(event) => setValue('supportPhone', event.target.value)} />
            <Field label="Default commission (%)" id="commission-rate" type="number" min="0" max="100" step="0.01" value={form.commissionRate} onChange={(event) => setValue('commissionRate', event.target.value)} />
          </div>
        )}

        {tab === 'Policies' && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Maximum COD order (PKR)" id="cod-limit" type="number" min="0" step="0.01" value={form.codMaxOrderAmount} onChange={(event) => setValue('codMaxOrderAmount', event.target.value)} />
            <Field label="Cancellation grace window (minutes)" id="cancel-grace" type="number" min="0" step="1" value={form.orderCancellationGraceMinutes} onChange={(event) => setValue('orderCancellationGraceMinutes', event.target.value)} />
            <div>
              <label htmlFor="onboarding-policy" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">Brand onboarding policy</label>
              <select id="onboarding-policy" value={form.brandOnboardingPolicy} onChange={(event) => setValue('brandOnboardingPolicy', event.target.value)} className={`h-11 ${inputClass}`}>
                <option value="MANUAL_APPROVAL">Manual Super Admin approval</option>
                <option value="INSTANT_ACTIVATION">Instant auto-activation</option>
              </select>
            </div>
          </div>
        )}

        {tab === 'System Controls' && (
          <div>
            <div className="mb-5">
              <label htmlFor="announcement-text" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">Global announcement</label>
              <textarea id="announcement-text" rows={4} maxLength={500} value={form.announcement.text} onChange={(event) => setValue('announcement', { ...form.announcement, text: event.target.value })} className={`${inputClass} py-3`} />
            </div>
            <Toggle id="announcement-enabled" label="Show announcement banner" checked={form.announcement.enabled} onChange={(enabled) => setValue('announcement', { ...form.announcement, enabled })} />
            <Toggle id="maintenance-mode" label="Maintenance mode" checked={form.maintenanceMode} onChange={(maintenanceMode) => setValue('maintenanceMode', maintenanceMode)} />
          </div>
        )}

        <button type="submit" disabled={saving} className={btnDark}>{saving ? 'Saving…' : 'Save settings'}</button>
      </form>
    </>
  )
}