import { useCallback, useEffect, useState } from 'react'
import { FileText, Play, Receipt } from 'lucide-react'
import api, { getErrorMessage } from '../../../services/api'
import { EmptyState, Modal, Skeleton, toast } from '../../../components/ui'
import { Pager, StatusBadge, TableScroll, selectClass, tableHead, tableRow } from '../../../components/brand/Bits'
import { btnGhost, formatDate } from '../../../ui'
import { formatPaisa, INVOICE_STATUS_OPTIONS, SELLER_TYPE_OPTIONS } from '../../../utils/billingUi'

export default function InvoicesTab({ onChanged }) {
  const [filters, setFilters] = useState({ status: '', sellerType: '', periodKey: '' })
  const [, setPage] = useState(1)
  const [data, setData] = useState({ items: [], pagination: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [confirmGenerate, setConfirmGenerate] = useState(false)

  const load = useCallback(
    async (nextPage = 1) => {
      setLoading(true)
      setError('')
      try {
        const { data: body } = await api.get('/admin/billing/invoices', {
          params: {
            page: nextPage,
            limit: 20,
            ...(filters.status && { status: filters.status }),
            ...(filters.sellerType && { sellerType: filters.sellerType }),
            ...(filters.periodKey && { periodKey: filters.periodKey }),
          },
        })
        setData({ items: body.invoices, pagination: body.pagination })
        setPage(nextPage)
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    },
    [filters],
  )

  useEffect(() => {
    load(1)
  }, [load])

  async function openDetail(invoice) {
    try {
      const { data: body } = await api.get(`/admin/billing/invoices/${invoice._id}`)
      setDetail(body)
    } catch (err) {
      toast(getErrorMessage(err), { type: 'error' })
    }
  }

  async function openReceipt(claim) {
    try {
      const { data: body } = await api.get(`/admin/billing/claims/${claim._id}/receipt`)
      window.open(body.receipt.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast(getErrorMessage(err), { type: 'error' })
    }
  }

  async function generate() {
    setConfirmGenerate(false)
    setGenerating(true)
    try {
      const { data: body } = await api.post('/admin/billing/invoices/generate')
      toast(`Invoices for ${body.periodKey}: ${body.issued} issued.`, { type: 'success' })
      load(1)
      if (onChanged) onChanged()
    } catch (err) {
      toast(getErrorMessage(err), { type: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <select
          aria-label="Invoice status"
          className={selectClass}
          value={filters.status}
          onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
        >
          <option value="">All statuses</option>
          {INVOICE_STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <select
          aria-label="Seller type"
          className={selectClass}
          value={filters.sellerType}
          onChange={(event) => setFilters((current) => ({ ...current, sellerType: event.target.value }))}
        >
          <option value="">All sellers</option>
          {SELLER_TYPE_OPTIONS.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <input
          aria-label="Period (YYYY-MM)"
          placeholder="Period YYYY-MM"
          className={`h-10 rounded-tile border border-line-warm bg-paper-warm px-3 text-[13px] outline-none focus:border-ink`}
          value={filters.periodKey}
          onChange={(event) => setFilters((current) => ({ ...current, periodKey: event.target.value }))}
        />
        <button type="button" onClick={() => setConfirmGenerate(true)} disabled={generating} className={`${btnGhost} ml-auto`}>
          <Play className="h-4 w-4" aria-hidden="true" />
          {generating ? 'Generating…' : 'Generate last month now'}
        </button>
      </div>

      {confirmGenerate && (
        <div className="mb-4 rounded-tile border border-[#e5d2a9] bg-[#f8efd9] px-4 py-3">
          <p className="text-[13px] leading-relaxed text-ink">
            Generate invoices for last month now? Sellers are billed 1% commission on completed sales and bookings.
            Invoices already issued for the period are left untouched.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="inline-flex h-9 items-center rounded-tile bg-forest px-3.5 text-[12.5px] font-medium text-cream transition hover:bg-forest-deep disabled:opacity-50"
            >
              {generating ? 'Generating…' : 'Yes, generate'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmGenerate(false)}
              className="inline-flex h-9 items-center rounded-tile border border-line-warm bg-paper-warm px-3.5 text-[12.5px] font-medium text-ink transition hover:border-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mb-4 rounded-tile bg-clay/5 px-3 py-2 text-sm text-clay">{error}</p>}

      {loading ? (
        <Skeleton className="h-64 w-full rounded-card" />
      ) : data.items.length === 0 ? (
        <EmptyState icon={FileText} title="No invoices" message="Change the filters or issue the month's bills." />
      ) : (
        <>
          <TableScroll label="Seller invoices">
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead className={tableHead}>
                <tr>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Seller</th>
                  <th className="px-4 py-3 text-right">Commission</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Due</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Due date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((invoice) => (
                  <tr key={invoice._id} className={tableRow}>
                    <td className="px-4 py-3 font-medium text-ink">{invoice.periodKey}</td>
                    <td className="px-4 py-3">
                      <span className="text-ink">{invoice.seller?.name || 'Unknown seller'}</span>
                      <span className="block text-[11.5px] text-ink/55">
                        {invoice.sellerType === 'BRAND' ? 'Brand' : 'Service provider'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-ink/55">{formatPaisa(invoice.commissionPaisa)}</td>
                    <td className="px-4 py-3 text-right text-ink/55">{formatPaisa(invoice.paidPaisa)}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink">{formatPaisa(invoice.amountDuePaisa)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={invoice.status} />
                    </td>
                    <td className="px-4 py-3 text-ink/55">{formatDate(invoice.dueAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => openDetail(invoice)} className="text-[12.5px] font-medium text-forest hover:underline">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <Pager pagination={data.pagination} onPage={load} />
        </>
      )}

      {detail && (
        <Modal open onClose={() => setDetail(null)} title={`Invoice ${detail.invoice.periodKey}`} maxWidth="max-w-2xl">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink">
                {detail.invoice.seller?.name}
                <span className="ml-2 text-[12px] text-ink/55">
                  {detail.invoice.sellerType === 'BRAND' ? 'Brand' : 'Service provider'}
                </span>
              </p>
              <StatusBadge value={detail.invoice.status} />
            </div>

            <div className="grid gap-3 rounded-card bg-sand/40 p-4 sm:grid-cols-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.08em] text-ink/55">Sales</p>
                <p className="font-medium">{formatPaisa(detail.invoice.salesPaisa)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.08em] text-ink/55">Commission</p>
                <p className="font-medium">{formatPaisa(detail.invoice.commissionPaisa)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.08em] text-ink/55">Credits</p>
                <p className="font-medium">−{formatPaisa(detail.invoice.creditsPaisa)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.08em] text-ink/55">Still due</p>
                <p className="font-medium">{formatPaisa(detail.invoice.amountDuePaisa)}</p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-display text-base font-semibold">Commission lines</h3>
              {detail.entries.length === 0 ? (
                <p className="text-sm text-ink/55">No lines.</p>
              ) : (
                <ul className="divide-y divide-line-warm rounded-tile border border-line-warm">
                  {detail.entries.map((entry) => (
                    <li key={entry._id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[13px]">
                      <span className="text-ink/55">{formatDate(entry.occurredAt)}</span>
                      <span className="text-ink">
                        {entry.sourceType === 'ORDER' ? 'Order' : 'Booking'}
                        {entry.kind === 'REVERSAL' ? ' · reversal' : ''}
                      </span>
                      <span className="text-ink/55">{formatPaisa(entry.eligibleAmountPaisa)}</span>
                      <span className="font-medium text-ink">{formatPaisa(entry.commissionPaisa)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-2 font-display text-base font-semibold">Claims</h3>
              {detail.claims.length === 0 ? (
                <p className="text-sm text-ink/55">No claims yet.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.claims.map((claim) => (
                    <li key={claim._id} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-line-warm px-3 py-2.5">
                      <span className="text-[13px] text-ink">
                        {formatPaisa(claim.amountPaisa)} · {claim.method.replaceAll('_', ' ').toLowerCase()} · {claim.reference}
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusBadge value={claim.status} />
                        {claim.receiptAvailable && (
                          <button type="button" onClick={() => openReceipt(claim)} className="inline-flex items-center gap-1 text-[12px] font-medium text-forest hover:underline">
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
      )}
    </>
  )
}
