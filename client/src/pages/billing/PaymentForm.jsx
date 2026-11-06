import { useState } from 'react'
import { Upload } from 'lucide-react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import { checkImageFile, uploadBillingReceipt } from '../../services/uploads'
import Field from '../../components/Field'
import { toast } from '../../components/ui'
import { btnGhost, btnPine, inputClass } from '../../ui'
import { CLAIM_METHODS, formatPaisa, inputToPaisa, paisaToInput } from '../../utils/billingUi'

const labelClass = 'mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted'

/**
 * The seller's statement that they paid an invoice (docs/15 §8). Only the
 * amount, method, reference and receipt travel to the server; the seller and
 * invoice come from the session and the URL, and the server checks the amount
 * against the real outstanding balance.
 */
export default function PaymentForm({ invoice, onCancel, onSubmitted }) {
  const [form, setForm] = useState({
    amount: paisaToInput(invoice.amountDuePaisa),
    method: 'BANK_TRANSFER',
    reference: '',
    comment: '',
  })
  const [receiptFile, setReceiptFile] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function setValue(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => ({ ...current, [name]: undefined }))
  }

  function pickReceipt(file) {
    if (!file) return
    const problem = checkImageFile(file)
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    setReceiptFile(file)
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setFieldErrors({})

    const amountPaisa = inputToPaisa(form.amount)
    if (!amountPaisa || amountPaisa < 1) {
      setFieldErrors({ amountPaisa: 'Enter the amount you paid.' })
      return
    }
    if (amountPaisa > invoice.amountDuePaisa) {
      setFieldErrors({ amountPaisa: `The most you can pay on this invoice is ${formatPaisa(invoice.amountDuePaisa)}.` })
      return
    }
    if (form.reference.trim().length < 3) {
      setFieldErrors({ reference: 'Enter the bank or wallet reference.' })
      return
    }

    setBusy(true)
    try {
      let receipt
      if (receiptFile) {
        const uploaded = await uploadBillingReceipt(receiptFile)
        receipt = { publicId: uploaded.publicId, fingerprint: uploaded.fingerprint }
      }
      const { data } = await api.post(`/billing/invoices/${invoice._id}/claims`, {
        amountPaisa,
        method: form.method,
        reference: form.reference.trim(),
        ...(form.comment.trim() && { comment: form.comment.trim() }),
        ...(receipt && { receipt }),
      })
      toast('Payment submitted. The platform team will verify it.', { type: 'success' })
      onSubmitted(data.claim)
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <p className="text-sm text-muted">
          Invoice <span className="font-medium text-ink">{invoice.periodKey}</span> · still due{' '}
          <span className="font-medium text-ink">{formatPaisa(invoice.amountDuePaisa)}</span>
        </p>
      </div>

      <Field
        label="Amount paid (PKR)"
        id="claim-amount"
        inputMode="decimal"
        value={form.amount}
        onChange={(event) => setValue('amount', event.target.value)}
        error={fieldErrors.amountPaisa}
        hint="You may pay part of the bill now and the rest later."
      />

      <div>
        <label htmlFor="claim-method" className={labelClass}>
          Payment method
        </label>
        <select
          id="claim-method"
          className={`h-11 ${inputClass}`}
          value={form.method}
          onChange={(event) => setValue('method', event.target.value)}
        >
          {CLAIM_METHODS.map((method) => (
            <option key={method.value} value={method.value}>
              {method.label}
            </option>
          ))}
        </select>
      </div>

      <Field
        label="Reference / transaction id"
        id="claim-reference"
        value={form.reference}
        onChange={(event) => setValue('reference', event.target.value)}
        error={fieldErrors.reference}
        hint="The bank or wallet reference that identifies this payment."
      />

      <div>
        <label htmlFor="claim-receipt" className={labelClass}>
          Receipt photo (optional)
        </label>
        <label
          htmlFor="claim-receipt"
          className="flex h-11 cursor-pointer items-center gap-2 rounded-md border border-dashed border-line bg-white px-3.5 text-[13px] text-muted transition hover:border-ink hover:text-ink"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {receiptFile ? receiptFile.name : 'Attach a JPG, PNG or WebP up to 5 MB'}
        </label>
        <input
          id="claim-receipt"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => pickReceipt(event.target.files?.[0])}
        />
      </div>

      <div>
        <label htmlFor="claim-comment" className={labelClass}>
          Comment (optional)
        </label>
        <textarea
          id="claim-comment"
          rows={3}
          maxLength={500}
          className={`${inputClass} py-2.5`}
          value={form.comment}
          onChange={(event) => setValue('comment', event.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-clay/5 px-3 py-2 text-sm text-clay">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className={btnGhost}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={btnPine}>
          {busy ? 'Submitting…' : 'Submit payment'}
        </button>
      </div>
    </form>
  )
}
