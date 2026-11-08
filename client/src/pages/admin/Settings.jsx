import { useEffect, useState } from 'react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import Field from '../../components/Field'
import { Notice, PageHeader, tabButton, tabRow } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import useReadOnly from '../../hooks/useReadOnly'
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

const optionalNumber = (value) =>
  value === '' || value === null || value === undefined ? null : Number(value)

function Tabs({ active, onChange }) {
  return (
    <div role="tablist" aria-label="Platform settings" className={tabRow}>
      {TABS.map((tab) => (
        <button key={tab} type="button" role="tab" aria-selected={active === tab} onClick={() => onChange(tab)} className={`${tabButton} ${active === tab ? 'border-ink text-ink' : 'border-transparent text-ink/55 hover:text-ink'}`}>
          {tab}
        </button>
      ))}
    </div>
  )
}

function Toggle({ id, label, checked, onChange }) {
  return (
    <label htmlFor={id} className="flex min-h-12 items-center justify-between gap-5 border-b border-line-warm py-3 last:border-b-0">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-9 shrink-0 cursor-pointer accent-ink" />
    </label>
  )
}

export default function AdminSettings() {
  const readOnly = useReadOnly()
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
        commissionRate: optionalNumber(form.commissionRate),
      }
    } else if (tab === 'Policies') {
      changes = {
        codMaxOrderAmount: optionalNumber(form.codMaxOrderAmount),
        brandOnboardingPolicy: form.brandOnboardingPolicy,
        orderCancellationGraceMinutes: optionalNumber(form.orderCancellationGraceMinutes),
      }
    } else {
      changes = { announcement: form.announcement, maintenanceMode: form.maintenanceMode }
    }

    try {
      const { data } = await api.patch('/admin/settings', changes)
      const settings = data.settings
      setForm((current) => ({
        ...current,
        ...settings,
        commissionRate: settings.commissionRate ?? '',
        codMaxOrderAmount: settings.codMaxOrderAmount ?? '',
        orderCancellationGraceMinutes: settings.orderCancellationGraceMinutes ?? '',
        announcement: { ...current.announcement, ...settings.announcement },
      }))
      setMessage({ text: 'Platform settings saved.', tone: 'ok' })
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-72 w-full rounded-card" /></div>

  return (
    <>
      <PageHeader title="Platform settings" intro="Marketplace identity, policies, and system controls." />
      <Notice tone={message.tone}>{message.text}</Notice>
      {readOnly && (
        <p className="mb-5 text-[12.5px] text-ink/55">Your access is read-only, so settings cannot be changed.</p>
      )}
      {Object.keys(fieldErrors).length > 0 && (
        <ul className="mb-5 space-y-1 text-xs text-clay" role="alert">
          {Object.entries(fieldErrors).map(([field, error]) => <li key={field}>{field}: {error}</li>)}
        </ul>
      )}
      <Tabs active={tab} onChange={setTab} />
      <form onSubmit={save} className="space-y-7 rounded-card border border-line-warm bg-paper-warm p-5 sm:p-7">
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
              <label htmlFor="onboarding-policy" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink/55">Brand onboarding policy</label>
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
              <label htmlFor="announcement-text" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink/55">Global announcement</label>
              <textarea id="announcement-text" rows={4} maxLength={500} value={form.announcement.text} onChange={(event) => setValue('announcement', { ...form.announcement, text: event.target.value })} className={`${inputClass} py-3`} />
            </div>
            <Toggle id="announcement-enabled" label="Show announcement banner" checked={form.announcement.enabled} onChange={(enabled) => setValue('announcement', { ...form.announcement, enabled })} />
            <Toggle id="maintenance-mode" label="Maintenance mode" checked={form.maintenanceMode} onChange={(maintenanceMode) => setValue('maintenanceMode', maintenanceMode)} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving || readOnly} className={btnDark}>
            {saving ? 'Saving…' : `Save ${tab.toLowerCase()}`}
          </button>
          <p className="text-[12px] text-ink/55">Only the open tab is saved.</p>
        </div>
      </form>
    </>
  )
}