import { useCallback, useEffect, useState } from 'react'
import {
  Building2,
  CircleHelp,
  Copy,
  ExternalLink,
  FileText,
  Landmark,
  Receipt,
  RefreshCw,
  Wallet,
} from 'lucide-react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import Field from '../../components/Field'
import { Notice, PageHeader, Pager, StatusBadge, tableHead, tableRow, tableShell } from '../../components/brand/Bits'
import { EmptyState, Modal, Skeleton, toast } from '../../components/ui'
import { btnGhost, btnPine, card, formatDate, formatDateTime, inputClass } from '../../ui'
import {
  billingStatusCopy,
  formatPaisa,
  BILLING_STATUS_COPY,
} from '../../utils/billingUi'
import PaymentForm from './PaymentForm'

const TABS = ['Overview', 'Invoices', 'Payments', 'Help']

function copyText(text) {
  if (!text) return
  navigator.clipboard?.writeText(text).then(
    () => toast('Copied to the clipboard.', { type: 'success' }),
    () => toast('Could not copy. Select the text instead.', { type: 'error' }),
  )
}

function Tabs({ active, onChange }) {
  return (
    <div role="tablist" aria-label="Billing" className="mb-6 flex flex-wrap gap-1 border-b border-line">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={active === tab}
          onClick={() => onChange(tab)}
          className={`border-b-2 px-4 py-3 text-[13px] font-medium transition-colors ${
            active === tab ? 'border-pine text-ink' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

function BankDetails({ bank }) {
  const rows = [
    ['Bank', bank.bankName],
    ['Account title', bank.accountTitle],
    ['Account number', bank.accountNumber],
    ['IBAN', bank.iban],
  ].filter(([, value]) => value)

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        The platform bank details are not published yet. Use the Help tab and the team will send them.
      </p>
    )
  }

  return (
    <div className="space-y-2.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-3">
          <span className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted">{label}</span>
          <span className="flex items-center gap-1.5 text-right text-sm font-medium text-ink">
            {value}
            <button
              type="button"
              aria-label={`Copy ${label}`}
              onClick={() => copyText(value)}
              className="rounded p-1 text-muted transition hover:bg-paper hover:text-ink"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      ))}
      {bank.instructions && <p className="border-t border-line pt-3 text-[12.5px] leading-relaxed text-muted">{bank.instructions}</p>}
    </div>
  )
}

function StatusPanel({ billing, onPay }) {
  const copy = billingStatusCopy(billing.seller.billingStatus)
  const oldest = billing.invoices[0] || null
  const due = billing.balancePaisa > 0

  return (
    <div className={`${card} overflow-hidden`}>
      <div
        className={`px-5 py-4 ${
          copy.tone === 'danger'
            ? 'bg-danger-soft'
            : copy.tone === 'warn'
              ? 'bg-warning-soft'
              : 'bg-success-soft'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/60">Billing status</p>
          <StatusBadge value={billing.seller.billingStatus} />
        </div>
        <h2 className="mt-1.5 font-display text-lg font-semibold tracking-tight text-ink">{copy.title}</h2>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink/70">{copy.message}</p>
      </div>

      <div className="grid gap-5 px-5 py-5 sm:grid-cols-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">Amount due</p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink">{formatPaisa(billing.balancePaisa)}</p>
          {oldest && (
            <p className="mt-1 text-[12px] text-muted">
              {billing.unpaidInvoiceCount} unpaid invoice{billing.unpaidInvoiceCount === 1 ? '' : 's'} · oldest due{' '}
              {formatDate(oldest.dueAt)}
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">Commission rate</p>
          <p className="mt-1 text-lg font-semibold text-ink">{(billing.settings.rateBps / 100).toFixed(2)}%</p>
          <p className="mt-1 text-[12px] text-muted">1% of completed sales, charged monthly.</p>
        </div>
        <div className="sm:text-right">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">Next step</p>
          {due ? (
            <button type="button" onClick={() => onPay(oldest)} className={`${btnPine} mt-2`}>
              <Wallet className="h-4 w-4" aria-hidden="true" />
              Pay now
            </button>
          ) : (
            <p className="mt-2 text-sm font-medium text-success">Nothing to pay right now.</p>
          )}
        </div>
      </div>

      {billing.seller.graceUntil && (
        <p className="border-t border-line bg-paper/50 px-5 py-3 text-[12.5px] text-muted">
          A grace period is active until {formatDateTime(billing.seller.graceUntil)}
          {billing.seller.graceReason ? ` — ${billing.seller.graceReason}` : ''}.
        </p>
      )}
      {billing.seller.override && (
        <p className="border-t border-line bg-paper/50 px-5 py-3 text-[12.5px] text-muted">
          The platform team set this status manually
          {billing.seller.override.until ? ` until ${formatDateTime(billing.seller.override.until)}` : ''}
          {billing.seller.override.reason ? ` — ${billing.seller.override.reason}` : ''}.
        </p>
      )}
    </div>
  )
}

function InvoiceDetail({ detail, onClose, onPay, onOpenReceipt }) {
  const invoice = detail.invoice
  return (
    <Modal open onClose={onClose} title={`Invoice ${invoice.periodKey}`} maxWidth="max-w-2xl">
      <div className="space-y-6">
        <div className="grid gap-3 rounded-lg bg-paper/60 p-4 sm:grid-cols-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted">Commission</p>
            <p className="font-medium text-ink">{formatPaisa(invoice.commissionPaisa)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted">Credits</p>
            <p className="font-medium text-ink">−{formatPaisa(invoice.creditsPaisa)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted">Paid</p>
            <p className="font-medium text-ink">{formatPaisa(invoice.paidPaisa)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted">Still due</p>
            <p className="font-medium text-ink">{formatPaisa(invoice.amountDuePaisa)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <span>
            Issued {formatDate(invoice.issuedAt)} · due {formatDate(invoice.dueAt)}{' '}
            <StatusBadge value={invoice.status} />
          </span>
          {invoice.amountDuePaisa > 0 && (
            <button type="button" onClick={() => onPay(invoice)} className={btnPine}>
              <Wallet className="h-4 w-4" aria-hidden="true" />
              Pay this invoice
            </button>
          )}
        </div>

        <div>
          <h3 className="mb-2 font-display text-base font-semibold">Sales behind this bill</h3>
          {detail.entries.length === 0 ? (
            <p className="text-sm text-muted">No commission lines were recorded for this invoice.</p>
          ) : (
            <div className={tableShell}>
              <table className="w-full text-left text-[13px]">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5 text-right">Sale</th>
                    <th className="px-3 py-2.5 text-right">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.entries.map((entry) => (
                    <tr key={entry._id} className={tableRow}>
                      <td className="px-3 py-2.5 text-muted">{formatDate(entry.occurredAt)}</td>
                      <td className="px-3 py-2.5 text-ink">
                        {entry.sourceType === 'ORDER' ? 'Order' : 'Service booking'}
                        {entry.kind === 'REVERSAL' ? ' · refund reversal' : ''}
                      </td>
                      <td className="px-3 py-2.5 text-right text-muted">{formatPaisa(entry.eligibleAmountPaisa)}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-ink">{formatPaisa(entry.commissionPaisa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-2 font-display text-base font-semibold">Payments claimed</h3>
          {detail.claims.length === 0 ? (
            <p className="text-sm text-muted">No payment has been submitted for this invoice yet.</p>
          ) : (
            <ul className="space-y-2">
              {detail.claims.map((claim) => (
                <li key={claim._id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2.5">
                  <span className="text-sm text-ink">
                    {formatPaisa(claim.amountPaisa)} · {claim.method.replaceAll('_', ' ').toLowerCase()} · {claim.reference}
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge value={claim.status} />
                    {claim.receiptAvailable && (
                      <button
                        type="button"
                        onClick={() => onOpenReceipt(claim)}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-pine hover:underline"
                      >
                        <Receipt className="h-3.5 w-3.5" /> Receipt
                      </button>
                    )}
                  </span>
                  {claim.rejectionReason && <p className="w-full text-[12px] text-clay">{claim.rejectionReason}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}

function HelpTab({ requests, onReload }) {
  const [form, setForm] = useState({ subject: '', message: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  async function submit(event) {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    setSaving(true)
    try {
      await api.post('/billing/help', form)
      toast('Your billing question was sent to the platform team.', { type: 'success' })
      setForm({ subject: '', message: '' })
      onReload()
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <form onSubmit={submit} className={`${card} space-y-4 p-5`}>
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">Ask about a bill</h2>
          <p className="mt-1 text-[13px] text-muted">
            A wrong amount, a payment you already made, or anything else about commission. Only the platform team
            sees this.
          </p>
        </div>
        <Field
          label="Subject"
          id="help-subject"
          value={form.subject}
          maxLength={150}
          onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
          error={fieldErrors.subject}
        />
        <div>
          <label htmlFor="help-message" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
            What do you need help with?
          </label>
          <textarea
            id="help-message"
            rows={6}
            maxLength={2000}
            className={`${inputClass} py-2.5`}
            value={form.message}
            onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
          />
          {fieldErrors.message && <p className="mt-1.5 text-xs text-clay">{fieldErrors.message}</p>}
        </div>
        {error && <p className="rounded-md bg-clay/5 px-3 py-2 text-sm text-clay">{error}</p>}
        <button type="submit" disabled={saving} className={btnPine}>
          {saving ? 'Sending…' : 'Send to the platform team'}
        </button>
      </form>

      <div className={`${card} p-5`}>
        <h2 className="font-display text-lg font-semibold tracking-tight">Your requests</h2>
        {requests.length === 0 ? (
          <EmptyState icon={CircleHelp} title="No requests yet" message="Answers from the platform team appear here." />
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {requests.map((request) => (
              <li key={request._id} className="py-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{request.subject}</p>
                  <StatusBadge value={request.status} />
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{request.message}</p>
                {request.resolutionNote && (
                  <p className="mt-2 rounded-md bg-paper px-2.5 py-2 text-[12.5px] text-ink">
                    <span className="font-medium">Platform team: </span>
                    {request.resolutionNote}
                  </p>
                )}
                <p className="mt-1.5 text-[11.5px] text-muted">{formatDateTime(request.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function BillingPage() {
  const [billing, setBilling] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState(TABS[0])

  const [invoicePage, setInvoicePage] = useState(1)
  const [, setClaimsPage] = useState(1)
  const [invoiceList, setInvoiceList] = useState({ items: [], pagination: null })
  const [claimList, setClaimList] = useState({ items: [], pagination: null })
  const [helpList, setHelpList] = useState({ items: [], pagination: null })

  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [payFor, setPayFor] = useState(null)

  const loadAccount = useCallback(async () => {
    try {
      const { data } = await api.get('/billing/account')
      setBilling(data.billing)
      setError('')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadInvoices = useCallback(async (page = 1) => {
    try {
      const { data } = await api.get('/billing/invoices', { params: { page, limit: 20 } })
      setInvoiceList({ items: data.invoices, pagination: data.pagination })
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }, [])

  const loadClaims = useCallback(async (page = 1) => {
    try {
      const { data } = await api.get('/billing/claims', { params: { page, limit: 20 } })
      setClaimList({ items: data.claims, pagination: data.pagination })
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }, [])

  const loadHelp = useCallback(async () => {
    try {
      const { data } = await api.get('/billing/help')
      setHelpList({ items: data.requests, pagination: data.pagination })
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }, [])

  useEffect(() => {
    loadAccount()
    loadInvoices(1)
    loadClaims(1)
    loadHelp()
  }, [loadAccount, loadInvoices, loadClaims, loadHelp])

  async function openInvoice(invoice) {
    setDetailLoading(true)
    try {
      const { data } = await api.get(`/billing/invoices/${invoice._id}`)
      setDetail(data)
    } catch (err) {
      toast(getErrorMessage(err), { type: 'error' })
    } finally {
      setDetailLoading(false)
    }
  }

  async function openReceipt(claim) {
    try {
      const { data } = await api.get(`/billing/claims/${claim._id}/receipt`)
      window.open(data.receipt.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast(getErrorMessage(err), { type: 'error' })
    }
  }

  async function afterPayment(claim) {
    setPayFor(null)
    setDetail(null)
    toast(`Payment submitted: ${formatPaisa(claim.amountPaisa)}.`, { type: 'success' })
    await Promise.all([loadAccount(), loadInvoices(invoicePage), loadClaims(1)])
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-44 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  if (!billing) {
    return (
      <>
        <PageHeader title="Billing" />
        <Notice tone="warn">{error || 'Billing could not be loaded.'}</Notice>
        <button type="button" onClick={loadAccount} className={btnGhost}>
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Billing"
        intro="Your 1% commission, monthly invoices and payments to CityCart."
        action={
          <button type="button" onClick={loadAccount} className={btnGhost}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </button>
        }
      />

      <StatusPanel billing={billing} onPay={(invoice) => setPayFor(invoice || billing.invoices[0])} />
      {error && <Notice tone="warn">{error}</Notice>}

      <div className="mt-7">
        <Tabs active={tab} onChange={setTab} />

        {tab === 'Overview' && (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-6">
              <div className={`${card} p-5`}>
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
                  <FileText className="h-4.5 w-4.5 text-pine" aria-hidden="true" /> Unpaid invoices
                </h2>
                {billing.invoices.length === 0 ? (
                  <EmptyState icon={FileText} title="No unpaid invoices" message="Your account is up to date." />
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {billing.invoices.map((invoice) => (
                      <li key={invoice._id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div>
                          <button
                            type="button"
                            onClick={() => openInvoice(invoice)}
                            className="text-sm font-medium text-pine hover:underline"
                          >
                            {invoice.periodKey}
                          </button>
                          <p className="text-[12px] text-muted">
                            Due {formatDate(invoice.dueAt)} · {formatPaisa(invoice.amountDuePaisa)} outstanding
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge value={invoice.status} />
                          <button type="button" onClick={() => setPayFor(invoice)} className="text-[12.5px] font-medium text-pine hover:underline">
                            Pay
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className={`${card} p-5`}>
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
                  <Receipt className="h-4.5 w-4.5 text-pine" aria-hidden="true" /> Recent payments
                </h2>
                {billing.recentClaims.length === 0 ? (
                  <EmptyState icon={Receipt} title="No payments submitted" message="Payments you submit appear here for verification." />
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {billing.recentClaims.map((claim) => (
                      <li key={claim._id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div>
                          <p className="text-sm font-medium text-ink">{formatPaisa(claim.amountPaisa)}</p>
                          <p className="text-[12px] text-muted">
                            {claim.method.replaceAll('_', ' ').toLowerCase()} · {claim.reference} · {formatDate(claim.createdAt)}
                          </p>
                          {claim.rejectionReason && <p className="text-[12px] text-clay">{claim.rejectionReason}</p>}
                        </div>
                        <span className="flex items-center gap-2">
                          <StatusBadge value={claim.status} />
                          {claim.receiptAvailable && (
                            <button type="button" onClick={() => openReceipt(claim)} className="text-[12px] font-medium text-pine hover:underline">
                              Receipt
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className={`${card} p-5`}>
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
                  <Landmark className="h-4.5 w-4.5 text-pine" aria-hidden="true" /> Where to pay
                </h2>
                <p className="mb-3 mt-1 text-[12.5px] text-muted">
                  Pay the platform directly, then submit the reference here. Never pay a rider or delivery person.
                </p>
                <BankDetails bank={billing.bank} />
              </div>

              <div className={`${card} p-5`}>
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
                  <Building2 className="h-4.5 w-4.5 text-pine" aria-hidden="true" /> How billing works
                </h2>
                <ol className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-muted">
                  <li>
                    <span className="font-medium text-ink">1% commission</span> on completed sales. Delivery fees and
                    tax are never included.
                  </li>
                  <li>
                    Invoices close the calendar month on the 1st and are due in{' '}
                    <span className="font-medium text-ink">{billing.settings.dueDays} days</span>. Bills below{' '}
                    {formatPaisa(billing.settings.minimumInvoicePaisa)} roll into the next month.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Due date:</span> a warning on your dashboard, orders still
                    allowed.
                  </li>
                  <li>
                    <span className="font-medium text-ink">{BILLING_STATUS_COPY.RESTRICTED.title}:</span> from{' '}
                    {billing.settings.restrictAfterDays} days after the due date you cannot take new orders or bookings.
                    Existing work still has to be fulfilled.
                  </li>
                  <li>
                    <span className="font-medium text-ink">{BILLING_STATUS_COPY.FROZEN.title}:</span> from{' '}
                    {billing.settings.freezeAfterDays} days after the due date your listings are hidden. Paying restores
                    them.
                  </li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {tab === 'Invoices' && (
          <div className={tableShell}>
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className={tableHead}>
                <tr>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3 text-right">Commission</th>
                  <th className="px-4 py-3 text-right">Credits</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Due</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Due date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {invoiceList.items.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState icon={FileText} title="No invoices yet" message="Your first invoice is issued after your first month with sales." />
                    </td>
                  </tr>
                ) : (
                  invoiceList.items.map((invoice) => (
                    <tr key={invoice._id} className={tableRow}>
                      <td className="px-4 py-3 font-medium text-ink">{invoice.periodKey}</td>
                      <td className="px-4 py-3 text-right text-muted">{formatPaisa(invoice.commissionPaisa)}</td>
                      <td className="px-4 py-3 text-right text-muted">−{formatPaisa(invoice.creditsPaisa)}</td>
                      <td className="px-4 py-3 text-right text-muted">{formatPaisa(invoice.paidPaisa)}</td>
                      <td className="px-4 py-3 text-right font-medium text-ink">{formatPaisa(invoice.amountDuePaisa)}</td>
                      <td className="px-4 py-3"><StatusBadge value={invoice.status} /></td>
                      <td className="px-4 py-3 text-muted">{formatDate(invoice.dueAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => openInvoice(invoice)} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-pine hover:underline">
                          View <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'Invoices' && (
          <Pager
            pagination={invoiceList.pagination}
            onPage={(page) => {
              setInvoicePage(page)
              loadInvoices(page)
            }}
          />
        )}

        {tab === 'Payments' && (
          <>
            <div className={tableShell}>
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-4 py-3">Submitted</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {claimList.items.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState icon={Receipt} title="No payments yet" message="Submit a payment from an unpaid invoice." />
                      </td>
                    </tr>
                  ) : (
                    claimList.items.map((claim) => (
                      <tr key={claim._id} className={tableRow}>
                        <td className="px-4 py-3 text-muted">{formatDateTime(claim.createdAt)}</td>
                        <td className="px-4 py-3 text-right font-medium text-ink">{formatPaisa(claim.amountPaisa)}</td>
                        <td className="px-4 py-3 capitalize text-muted">{claim.method.replaceAll('_', ' ').toLowerCase()}</td>
                        <td className="px-4 py-3 text-muted">{claim.reference}</td>
                        <td className="px-4 py-3">
                          <StatusBadge value={claim.status} />
                          {claim.rejectionReason && <p className="mt-1 text-[11.5px] text-clay">{claim.rejectionReason}</p>}
                          {claim.creditPaisa > 0 && (
                            <p className="mt-1 text-[11.5px] text-muted">
                              {formatPaisa(claim.creditPaisa)} carried to a later invoice
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {claim.receiptAvailable && (
                            <button type="button" onClick={() => openReceipt(claim)} className="text-[12.5px] font-medium text-pine hover:underline">
                              Receipt
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pager
              pagination={claimList.pagination}
              onPage={(page) => {
                setClaimsPage(page)
                loadClaims(page)
              }}
            />
          </>
        )}

        {tab === 'Help' && <HelpTab requests={helpList.items} onReload={loadHelp} />}
      </div>

      {detail && !payFor && (
        <InvoiceDetail
          detail={detail}
          onClose={() => setDetail(null)}
          onPay={(invoice) => setPayFor(invoice)}
          onOpenReceipt={openReceipt}
        />
      )}

      {payFor && (
        <Modal open onClose={() => setPayFor(null)} title="Submit a payment" maxWidth="max-w-lg">
          <PaymentForm invoice={payFor} onCancel={() => setPayFor(null)} onSubmitted={afterPayment} />
        </Modal>
      )}

      {detailLoading && <p className="mt-3 text-sm text-muted">Loading invoice…</p>}
    </>
  )
}
