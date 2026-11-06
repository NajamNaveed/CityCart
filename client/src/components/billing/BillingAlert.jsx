import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, Landmark } from 'lucide-react'
import api from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { Modal } from '../ui'
import { formatDate } from '../../ui'
import { billingStatusCopy, formatPaisa } from '../../utils/billingUi'

/**
 * The login warning for a seller whose bill is due (docs/15 §9, docs/24 §5.5):
 * a banner on every dashboard screen plus one dismissible dialog, both naming
 * the amount, the due date and the platform bank details.
 *
 * The server decides the status; this component only reads it. A brand
 * employee is not the billing owner, so no call is made for them.
 */
export default function BillingAlert({ billingPath }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const owner = user?.role === 'BRAND_ADMIN' || user?.role === 'SERVICE_PROVIDER'
  const [billing, setBilling] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  // The billing page already explains everything; no dialog on top of it.
  const onBillingPage = pathname === billingPath

  useEffect(() => {
    if (!owner) return undefined
    let active = true
    api
      .get('/billing/account')
      .then(({ data }) => active && setBilling(data.billing))
      // The billing page itself reports the real error; this banner stays quiet.
      .catch(() => {})
    return () => {
      active = false
    }
  }, [owner])

  if (!owner || !billing) return null
  const status = billing.seller.billingStatus
  if (status === 'ACTIVE') return null

  const copy = billingStatusCopy(status)
  const oldest = billing.invoices[0] || null
  const bank = billing.bank
  const bankLine = [bank.bankName, bank.accountTitle, bank.iban || bank.accountNumber].filter(Boolean).join(' · ')

  return (
    <>
      <div
        role="status"
        className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-[13px] ${
          copy.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'
        }`}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <strong className="font-semibold">{formatPaisa(billing.balancePaisa)}</strong> is due
          {oldest ? ` (${formatDate(oldest.dueAt)})` : ''}. {copy.title}.
        </span>
        <Link to={billingPath} className="font-semibold underline underline-offset-2">
          Open billing
        </Link>
      </div>

      <Modal open={!dismissed && !onBillingPage} onClose={() => setDismissed(true)} title={copy.title}>
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink/80">{copy.message}</p>

          <div className="rounded-lg bg-paper px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">Amount due</p>
            <p className="font-display text-2xl font-semibold text-ink">{formatPaisa(billing.balancePaisa)}</p>
            {oldest && <p className="mt-1 text-[12.5px] text-muted">Oldest invoice due {formatDate(oldest.dueAt)}</p>}
          </div>

          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
              <Landmark className="h-3.5 w-3.5" aria-hidden="true" /> Pay to
            </p>
            {bankLine ? (
              <p className="mt-1 text-sm font-medium text-ink">{bankLine}</p>
            ) : (
              <p className="mt-1 text-sm text-muted">The platform bank details are on the Billing page.</p>
            )}
            {bank.instructions && <p className="mt-1 text-[12px] leading-relaxed text-muted">{bank.instructions}</p>}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setDismissed(true)} className="px-4 py-2 text-[13px] font-medium text-muted hover:text-ink">
              Later
            </button>
            <Link
              to={billingPath}
              onClick={() => setDismissed(true)}
              className="inline-flex h-10 items-center rounded-md bg-pine px-5 text-[13px] font-medium text-white transition hover:bg-pine-dark"
            >
              Go to Billing
            </Link>
          </div>
        </div>
      </Modal>
    </>
  )
}
