import { useEffect, useState } from 'react'
import { Landmark, Percent, TimerReset } from 'lucide-react'
import api, { getErrorMessage, getFieldErrors } from '../../../services/api'
import { Notice } from '../../../components/brand/Bits'
import { Skeleton, toast } from '../../../components/ui'
import { btnPine, card, inputClass } from '../../../ui'
import { inputToPaisa, paisaToInput } from '../../../utils/billingUi'

const EMPTY = {
  ratePercent: '1',
  dueDays: '7',
  restrictAfterDays: '7',
  freezeAfterDays: '14',
  minimumInvoice: '100.00',
  bankName: '',
  accountTitle: '',
  accountNumber: '',
  iban: '',
  instructions: '',
}

function toForm(settings) {
  return {
    ratePercent: String(settings.rateBps / 100),
    dueDays: String(settings.dueDays),
    restrictAfterDays: String(settings.restrictAfterDays),
    freezeAfterDays: String(settings.freezeAfterDays),
    minimumInvoice: paisaToInput(settings.minimumInvoicePaisa),
    bankName: settings.bank.bankName,
    accountTitle: settings.bank.accountTitle,
    accountNumber: settings.bank.accountNumber,
    iban: settings.bank.iban,
    instructions: settings.bank.instructions,
  }
}

function Field({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink/55">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[11.5px] text-ink/55">{hint}</p>}
    </div>
  )
}

export default function SettingsTab({ onChanged }) {
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    let active = true
    api
      .get('/admin/billing/settings')
      .then(({ data }) => active && setForm(toForm(data.settings)))
      .catch((err) => active && setError(getErrorMessage(err)))
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
    setError('')
    setFieldErrors({})

    if (!/^\d+(\.\d{1,2})?$/.test(form.ratePercent.trim()) || Number(form.ratePercent) > 100) {
      toast('Enter the rate as a percentage, for example 1 or 0.50.', { type: 'error' })
      return
    }
    const minimumInvoicePaisa = inputToPaisa(form.minimumInvoice)
    if (minimumInvoicePaisa === null) {
      toast('Enter the minimum invoice as money, for example 100.00.', { type: 'error' })
      return
    }
    const numbers = {
      dueDays: Number(form.dueDays),
      restrictAfterDays: Number(form.restrictAfterDays),
      freezeAfterDays: Number(form.freezeAfterDays),
    }
    if (Object.values(numbers).some((value) => !Number.isInteger(value) || value < 0)) {
      toast('Day counts must be whole numbers.', { type: 'error' })
      return
    }
    if (numbers.freezeAfterDays < numbers.restrictAfterDays) {
      toast('Listings cannot be hidden before new orders are paused.', { type: 'error' })
      return
    }

    setSaving(true)
    try {
      const { data } = await api.patch('/admin/billing/settings', {
        rateBps: Math.round(Number(form.ratePercent) * 100),
        ...numbers,
        minimumInvoicePaisa,
        bank: {
          bankName: form.bankName.trim(),
          accountTitle: form.accountTitle.trim(),
          accountNumber: form.accountNumber.trim(),
          iban: form.iban.trim(),
          instructions: form.instructions.trim(),
        },
      })
      setForm(toForm(data.settings))
      toast('Billing settings saved.', { type: 'success' })
      if (onChanged) onChanged()
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-card" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    )
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Notice tone="warn">{error}</Notice>

      <div className={`${card} p-5`}>
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
          <Percent className="h-4.5 w-4.5 text-forest" aria-hidden="true" /> Commission and due dates
        </h2>
        <p className="mt-1 text-[13px] text-ink/55">
          Changes apply to new commission entries. Entries already recorded keep the rate that was stored with them.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            id="billing-rate"
            label="Commission rate (%)"
            hint="1 means 1% of the sale, excluding delivery fee and tax."
          >
            <input
              id="billing-rate"
              className={`h-10 ${inputClass}`}
              inputMode="decimal"
              value={form.ratePercent}
              onChange={(event) => setValue('ratePercent', event.target.value)}
              required
            />
            {fieldErrors.rateBps && <p className="mt-1 text-xs text-clay">{fieldErrors.rateBps}</p>}
          </Field>
          <Field
            id="billing-minimum"
            label="Minimum invoice (PKR)"
            hint="Bills below this roll into the next month."
          >
            <input
              id="billing-minimum"
              className={`h-10 ${inputClass}`}
              inputMode="decimal"
              value={form.minimumInvoice}
              onChange={(event) => setValue('minimumInvoice', event.target.value)}
              required
            />
            {fieldErrors.minimumInvoicePaisa && (
              <p className="mt-1 text-xs text-clay">{fieldErrors.minimumInvoicePaisa}</p>
            )}
          </Field>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field id="billing-due" label="Due after (days)" hint="From the 1st of the month.">
            <input
              id="billing-due"
              type="number"
              min="0"
              max="90"
              className={`h-10 ${inputClass}`}
              value={form.dueDays}
              onChange={(event) => setValue('dueDays', event.target.value)}
              required
            />
          </Field>
          <Field id="billing-restrict" label="Pause orders after (days overdue)" hint="Existing work can still be fulfilled.">
            <input
              id="billing-restrict"
              type="number"
              min="0"
              max="90"
              className={`h-10 ${inputClass}`}
              value={form.restrictAfterDays}
              onChange={(event) => setValue('restrictAfterDays', event.target.value)}
              required
            />
          </Field>
          <Field id="billing-freeze" label="Hide listings after (days overdue)" hint="Must be on or after the pause day.">
            <input
              id="billing-freeze"
              type="number"
              min="0"
              max="180"
              className={`h-10 ${inputClass}`}
              value={form.freezeAfterDays}
              onChange={(event) => setValue('freezeAfterDays', event.target.value)}
              required
            />
          </Field>
        </div>

        <p className="mt-4 flex items-start gap-2 rounded-tile bg-sand/50 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink/55">
          <TimerReset className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          The ladder is: due date warning, paused new orders, then hidden listings. A verified payment restores the
          seller immediately. Manual overrides and grace periods are on the Sellers tab.
        </p>
      </div>

      <div className={`${card} p-5`}>
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
          <Landmark className="h-4.5 w-4.5 text-forest" aria-hidden="true" /> Where sellers pay
        </h2>
        <p className="mt-1 text-[13px] text-ink/55">
          These details appear on every seller's billing page. Leave a field empty to hide it.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="bank-name" label="Bank">
            <input
              id="bank-name"
              maxLength={120}
              className={`h-10 ${inputClass}`}
              value={form.bankName}
              onChange={(event) => setValue('bankName', event.target.value)}
            />
          </Field>
          <Field id="bank-title" label="Account title">
            <input
              id="bank-title"
              maxLength={120}
              className={`h-10 ${inputClass}`}
              value={form.accountTitle}
              onChange={(event) => setValue('accountTitle', event.target.value)}
            />
          </Field>
          <Field id="bank-number" label="Account number">
            <input
              id="bank-number"
              maxLength={60}
              className={`h-10 ${inputClass}`}
              value={form.accountNumber}
              onChange={(event) => setValue('accountNumber', event.target.value)}
            />
          </Field>
          <Field id="bank-iban" label="IBAN">
            <input
              id="bank-iban"
              maxLength={40}
              className={`h-10 ${inputClass}`}
              value={form.iban}
              onChange={(event) => setValue('iban', event.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Field id="bank-instructions" label="Instructions for sellers">
            <textarea
              id="bank-instructions"
              rows={3}
              maxLength={1000}
              className={`${inputClass} py-2.5`}
              value={form.instructions}
              onChange={(event) => setValue('instructions', event.target.value)}
            />
          </Field>
        </div>
      </div>

      <button type="submit" disabled={saving} className={btnPine}>
        {saving ? 'Saving…' : 'Save billing settings'}
      </button>
    </form>
  )
}
